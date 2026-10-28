/**
 * Pragmatic browser “vocal prefer” path for RH melody.
 *
 * Approach (no Demucs — too heavy for Pages):
 * 1. Heuristic vocal presence: mid-band (≈200–4000 Hz) energy + stereo center ratio
 * 2. If likely vocals: build a **vocal-oriented stem**
 *    - Stereo: keep mid (center) = (L+R)/2, attenuate sides; then band-emphasize 150–5000 Hz
 *    - Mono: band-emphasize the same range (can't truly separate)
 * 3. Else: use full mono mix for predominant instrumental melody
 *
 * Limits: mono phone-speaker captures, off-center vocals, and heavy reverb reduce quality.
 */

import { mixToMono } from './resample'

export type MelodySource = 'vocal' | 'instrumental'

export interface VocalDetectResult {
  likely: boolean
  confidence: number // 0..1
  midRatio: number
  centerRatio: number
  stereo: boolean
}

function bandEnergy(
  samples: Float32Array,
  sampleRate: number,
  loHz: number,
  hiHz: number,
): number {
  // Crude Goertzel-ish block energy via time-domain IIR bandpass approximation:
  // downsample-count zero crossings / RMS in filtered signal using simple biquad-like one-pole filters.
  const nyquist = sampleRate / 2
  const lo = Math.max(20, Math.min(loHz, nyquist - 1))
  const hi = Math.max(lo + 1, Math.min(hiHz, nyquist - 1))
  // One-pole HP then LP
  const hpRC = 1 / (2 * Math.PI * lo)
  const lpRC = 1 / (2 * Math.PI * hi)
  const dt = 1 / sampleRate
  const hpA = hpRC / (hpRC + dt)
  const lpA = dt / (lpRC + dt)
  let prevX = 0
  let hpY = 0
  let lpY = 0
  let sum = 0
  const step = Math.max(1, Math.floor(samples.length / 80000)) // cap work on long clips
  let n = 0
  for (let i = 0; i < samples.length; i += step) {
    const x = samples[i]!
    hpY = hpA * (hpY + x - prevX)
    prevX = x
    lpY += lpA * (hpY - lpY)
    sum += lpY * lpY
    n++
  }
  return n ? sum / n : 0
}

function stereoCenterAndSides(buffer: AudioBuffer): {
  center: Float32Array
  sides: Float32Array
  centerRatio: number
} {
  const L = buffer.getChannelData(0)
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L
  const n = Math.min(L.length, R.length)
  const center = new Float32Array(n)
  const sides = new Float32Array(n)
  let cE = 0
  let sE = 0
  for (let i = 0; i < n; i++) {
    const c = 0.5 * (L[i]! + R[i]!)
    const s = 0.5 * (L[i]! - R[i]!)
    center[i] = c
    sides[i] = s
    cE += c * c
    sE += s * s
  }
  const tot = cE + sE + 1e-12
  return { center, sides, centerRatio: cE / tot }
}

/** Soft band emphasize ~150–5000 Hz for vocal-ish content. */
function emphasizeVocalBand(samples: Float32Array, sampleRate: number): Float32Array {
  const out = new Float32Array(samples.length)
  const hpRC = 1 / (2 * Math.PI * 150)
  const lpRC = 1 / (2 * Math.PI * 5000)
  const dt = 1 / sampleRate
  const hpA = hpRC / (hpRC + dt)
  const lpA = dt / (lpRC + dt)
  let prevX = 0
  let hpY = 0
  let lpY = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!
    hpY = hpA * (hpY + x - prevX)
    prevX = x
    lpY += lpA * (hpY - lpY)
    // Blend filtered with a bit of dry so we don't hollow everything out
    out[i] = lpY * 0.85 + x * 0.15
  }
  // Peak normalize lightly
  let peak = 1e-6
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]!))
  const g = Math.min(4, 0.9 / peak)
  for (let i = 0; i < out.length; i++) out[i]! *= g
  return out
}

function floatToAudioBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
  const ctx = new OfflineAudioContext(1, Math.max(1, samples.length), sampleRate)
  const buf = ctx.createBuffer(1, Math.max(1, samples.length), sampleRate)
  buf.getChannelData(0).set(samples)
  return buf
}

export function detectVocals(buffer: AudioBuffer): VocalDetectResult {
  const mono = mixToMono(buffer)
  const sampleRate = buffer.sampleRate
  const low = bandEnergy(mono, sampleRate, 40, 200)
  const mid = bandEnergy(mono, sampleRate, 200, 4000)
  const high = bandEnergy(mono, sampleRate, 4000, Math.min(12000, sampleRate / 2 - 1))
  const tot = low + mid + high + 1e-12
  const midRatio = mid / tot

  const stereo = buffer.numberOfChannels > 1
  let centerRatio = 0.5
  if (stereo) {
    centerRatio = stereoCenterAndSides(buffer).centerRatio
  }

  // Mid-band dominant + (if stereo) strong center → likely lead vocal in pop mixes
  let score = midRatio * 0.7 + (stereo ? centerRatio * 0.3 : midRatio * 0.25)
  // Penalize bass-heavy instrumentals
  if (low / tot > 0.45) score *= 0.75

  const confidence = Math.max(0, Math.min(1, score))
  const likely = confidence >= 0.42 && midRatio >= 0.32

  return { likely, confidence, midRatio, centerRatio, stereo }
}

/**
 * AudioBuffer fed to Basic Pitch for RH:
 * vocal stem when vocals likely, else full mono mix (instrumental melody).
 */
export function buildRhSourceBuffer(buffer: AudioBuffer): {
  source: MelodySource
  buffer: AudioBuffer
  detect: VocalDetectResult
} {
  const detect = detectVocals(buffer)
  if (detect.likely) {
    let stem: Float32Array
    if (buffer.numberOfChannels > 1) {
      const { center } = stereoCenterAndSides(buffer)
      stem = emphasizeVocalBand(center, buffer.sampleRate)
    } else {
      stem = emphasizeVocalBand(mixToMono(buffer), buffer.sampleRate)
    }
    return {
      source: 'vocal',
      buffer: floatToAudioBuffer(stem, buffer.sampleRate),
      detect,
    }
  }
  return {
    source: 'instrumental',
    buffer: floatToAudioBuffer(mixToMono(buffer), buffer.sampleRate),
    detect,
  }
}
