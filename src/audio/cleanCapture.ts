/**
 * Post-capture musical cleaning for extraction:
 * - Detect musical onset (energy rise above noise floor)
 * - Trim leading / trailing silence & hiss
 * - Soft high-pass (~80 Hz) + noise gate
 *
 * Does NOT use voice AGC. Bar 1 should align to returned onset (t′=0 after trim).
 */

import { mixToMono } from './resample'

/** Safety: ignore endless hiss after song if energy never drops — still trim. */
const HOP_SEC = 0.02
const HPF_HZ = 80
/** Gate floor relative to noise estimate. */
const GATE_RATIO = 1.8
/** Onset must exceed noise * this. */
const ONSET_RATIO = 3.2
/** Require this many consecutive loud hops to count as music. */
const ONSET_HOLD_HOPS = 4
const MIN_MUSIC_SEC = 0.4

export interface CleanCaptureResult {
  /** Trimmed + gated PCM as WAV blob. */
  blob: Blob
  /** Seconds trimmed from the original file head (silence before music). */
  musicStartOffsetSec: number
  /** Seconds trimmed from the tail. */
  trailingTrimSec: number
  durationSec: number
  sampleRate: number
  /** Rough noise-floor RMS used for gating. */
  noiseFloor: number
}

function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const numFrames = samples.length
  const dataSize = numFrames * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

function highPass(samples: Float32Array, sampleRate: number, hz: number): Float32Array {
  const out = new Float32Array(samples.length)
  const rc = 1 / (2 * Math.PI * hz)
  const dt = 1 / sampleRate
  const a = rc / (rc + dt)
  let prevX = 0
  let prevY = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!
    prevY = a * (prevY + x - prevX)
    prevX = x
    out[i] = prevY
  }
  return out
}

function rmsEnvelope(mono: Float32Array, sampleRate: number): {
  env: Float32Array
  hop: number
} {
  const hop = Math.max(1, Math.floor(sampleRate * HOP_SEC))
  const n = Math.floor(mono.length / hop)
  const env = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    const base = i * hop
    for (let j = 0; j < hop; j++) {
      const s = mono[base + j]!
      sum += s * s
    }
    env[i] = Math.sqrt(sum / hop)
  }
  return { env, hop }
}

function estimateNoiseFloor(env: Float32Array): number {
  if (!env.length) return 1e-5
  // Use lowest 20% of early frames (or whole clip if short) as noise estimate
  const early = Math.max(8, Math.min(env.length, Math.floor(env.length * 0.25)))
  const slice = Array.from(env.subarray(0, early)).sort((a, b) => a - b)
  const idx = Math.max(0, Math.floor(slice.length * 0.15))
  return Math.max(1e-5, slice[idx] ?? 1e-5)
}

function findMusicBounds(
  env: Float32Array,
  noise: number,
  hop: number,
  sampleRate: number,
): { startSample: number; endSample: number } {
  const onsetThresh = noise * ONSET_RATIO
  const gateThresh = noise * GATE_RATIO
  let startHop = 0
  let hold = 0
  for (let i = 0; i < env.length; i++) {
    if (env[i]! >= onsetThresh) {
      hold++
      if (hold >= ONSET_HOLD_HOPS) {
        startHop = Math.max(0, i - ONSET_HOLD_HOPS + 1)
        break
      }
    } else {
      hold = 0
    }
  }

  let endHop = env.length - 1
  hold = 0
  for (let i = env.length - 1; i >= startHop; i--) {
    if (env[i]! >= gateThresh) {
      hold++
      if (hold >= ONSET_HOLD_HOPS) {
        endHop = Math.min(env.length - 1, i + ONSET_HOLD_HOPS)
        break
      }
    } else {
      hold = 0
    }
  }

  let startSample = startHop * hop
  let endSample = Math.min((endHop + 1) * hop, env.length * hop)
  const minSamples = Math.floor(MIN_MUSIC_SEC * sampleRate)
  if (endSample - startSample < minSamples) {
    startSample = 0
    endSample = Math.min(env.length * hop, Math.max(minSamples, endSample))
  }
  return { startSample, endSample }
}

/** Soft noise gate: attenuate below floor instead of hard chop (avoids clicks). */
function applyNoiseGate(
  samples: Float32Array,
  sampleRate: number,
  noise: number,
): Float32Array {
  const hop = Math.max(1, Math.floor(sampleRate * HOP_SEC))
  const out = new Float32Array(samples.length)
  const open = noise * GATE_RATIO
  const close = noise * 1.15
  let openGain = 0
  for (let i = 0; i < samples.length; i += hop) {
    let sum = 0
    const end = Math.min(samples.length, i + hop)
    for (let j = i; j < end; j++) sum += samples[j]! * samples[j]!
    const rms = Math.sqrt(sum / Math.max(1, end - i))
    const target = rms >= open ? 1 : rms <= close ? 0.04 : 0.04 + 0.96 * ((rms - close) / (open - close + 1e-12))
    openGain += (target - openGain) * 0.35
    for (let j = i; j < end; j++) out[j] = samples[j]! * openGain
  }
  return out
}

/**
 * Clean a captured blob for pitch extraction: HPF → onset trim → gate → WAV.
 */
export async function cleanCaptureBlob(blob: Blob): Promise<CleanCaptureResult> {
  const ctx = new AudioContext()
  let audio: AudioBuffer
  try {
    const bytes = await blob.arrayBuffer()
    audio = await ctx.decodeAudioData(bytes.slice(0))
  } catch {
    await ctx.close().catch(() => undefined)
    return {
      blob,
      musicStartOffsetSec: 0,
      trailingTrimSec: 0,
      durationSec: 0,
      sampleRate: 44100,
      noiseFloor: 0,
    }
  }
  await ctx.close().catch(() => undefined)

  const sampleRate = audio.sampleRate
  let mono = mixToMono(audio)
  mono = highPass(mono, sampleRate, HPF_HZ)

  const { env, hop } = rmsEnvelope(mono, sampleRate)
  const noise = estimateNoiseFloor(env)
  const { startSample, endSample } = findMusicBounds(env, noise, hop, sampleRate)

  const trimmed = mono.subarray(startSample, endSample)
  const gated = applyNoiseGate(trimmed, sampleRate, noise)
  const outBlob = encodeWavMono(gated, sampleRate)

  const musicStartOffsetSec = startSample / sampleRate
  const trailingTrimSec = (mono.length - endSample) / sampleRate
  const durationSec = gated.length / sampleRate

  return {
    blob: outBlob,
    musicStartOffsetSec,
    trailingTrimSec,
    durationSec,
    sampleRate,
    noiseFloor: noise,
  }
}

/**
 * Slice the start of a blob for AudD (size-friendly ~15s of music).
 */
export async function sliceBlobForIdentify(blob: Blob, maxSec = 15): Promise<Blob> {
  const ctx = new AudioContext()
  try {
    const bytes = await blob.arrayBuffer()
    const audio = await ctx.decodeAudioData(bytes.slice(0))
    const maxSamples = Math.min(audio.length, Math.floor(audio.sampleRate * maxSec))
    if (maxSamples >= audio.length * 0.95) return blob
    const mono = mixToMono(audio).subarray(0, maxSamples)
    return encodeWavMono(mono, audio.sampleRate)
  } catch {
    return blob
  } finally {
    await ctx.close().catch(() => undefined)
  }
}
