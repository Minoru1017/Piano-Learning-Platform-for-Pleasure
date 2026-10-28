/**
 * Best-effort stem characterization for browser (not Demucs).
 *
 * Maps mixing-style cues → presence scores used as feature gates:
 * - BASS: low-band energy (<~180 Hz)
 * - 人聲: mid + center (via vocalPrefer)
 * - 主旋律: mid-high when vocals weak / residual
 * - 和聲: mid sustained (low transient ratio)
 * - 點綴音: high / transient leftovers
 *
 * Honesty: mono phone-speaker, off-center leads, and dense pop mixes degrade quality.
 */

import { mixToMono } from './resample'
import { detectVocals, type VocalDetectResult } from './vocalPrefer'
import type { StemCharacterization } from '../types/music'
import type { RawPitchNote } from './arrangeFromPitch'

function bandEnergy(
  samples: Float32Array,
  sampleRate: number,
  loHz: number,
  hiHz: number,
): number {
  const nyquist = sampleRate / 2
  const lo = Math.max(20, Math.min(loHz, nyquist - 1))
  const hi = Math.max(lo + 1, Math.min(hiHz, nyquist - 1))
  const hpRC = 1 / (2 * Math.PI * lo)
  const lpRC = 1 / (2 * Math.PI * hi)
  const dt = 1 / sampleRate
  const hpA = hpRC / (hpRC + dt)
  const lpA = dt / (lpRC + dt)
  let prevX = 0
  let hpY = 0
  let lpY = 0
  let sum = 0
  const step = Math.max(1, Math.floor(samples.length / 80000))
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

/** Transient vs sustain: ratio of high-pass energy of |diff| vs RMS. */
function transientRatio(samples: Float32Array, sampleRate: number): number {
  const hop = Math.max(1, Math.floor(sampleRate * 0.01))
  let rms = 0
  let trans = 0
  let n = 0
  let prev = 0
  for (let i = 0; i + hop < samples.length; i += hop) {
    let e = 0
    for (let j = 0; j < hop; j++) {
      const s = samples[i + j]!
      e += s * s
    }
    e = Math.sqrt(e / hop)
    rms += e
    trans += Math.max(0, e - prev)
    prev = e
    n++
  }
  if (!n) return 0.5
  const meanRms = rms / n + 1e-12
  return Math.min(1, (trans / n) / meanRms)
}

function stereoCenterRatio(buffer: AudioBuffer): number {
  if (buffer.numberOfChannels < 2) return 0.5
  const L = buffer.getChannelData(0)
  const R = buffer.getChannelData(1)
  const n = Math.min(L.length, R.length)
  let cE = 0
  let sE = 0
  const step = Math.max(1, Math.floor(n / 100000))
  for (let i = 0; i < n; i += step) {
    const c = 0.5 * (L[i]! + R[i]!)
    const s = 0.5 * (L[i]! - R[i]!)
    cE += c * c
    sE += s * s
  }
  return cE / (cE + sE + 1e-12)
}

export interface CharacterizeResult {
  stems: StemCharacterization
  vocalDetect: VocalDetectResult
}

/**
 * Characterize stem presence from the mix (and vocal detect).
 */
export function characterizeStems(buffer: AudioBuffer): CharacterizeResult {
  const mono = mixToMono(buffer)
  const sr = buffer.sampleRate
  const bassE = bandEnergy(mono, sr, 40, 180)
  const lowMidE = bandEnergy(mono, sr, 180, 800)
  const midE = bandEnergy(mono, sr, 200, 4000)
  const highE = bandEnergy(mono, sr, 4000, Math.min(12000, sr / 2 - 1))
  const tot = bassE + lowMidE + midE + highE + 1e-12
  const trans = transientRatio(mono, sr)
  const center = stereoCenterRatio(buffer)
  const vocalDetect = detectVocals(buffer)

  const bassPresence = Math.min(1, (bassE / tot) * 2.2)
  const vocalPresence = vocalDetect.likely
    ? vocalDetect.confidence
    : Math.max(0, vocalDetect.confidence * 0.5)
  const melodyPresence = vocalDetect.likely
    ? Math.min(1, (midE / tot) * 1.2 * (1 - vocalPresence * 0.4))
    : Math.min(1, (midE / tot) * 2)
  // Sustained mid without strong onsets → harmony-ish
  const harmonyPresence = Math.min(1, (lowMidE / tot) * 1.8 * (1 - trans * 0.5))
  const ornamentPresence = Math.min(1, (highE / tot) * 2.5 * (0.4 + trans * 0.6))

  return {
    vocalDetect,
    stems: {
      method: 'band-stereo-transient',
      bass: {
        presence: bassPresence,
        eqHint: '低通 ≈40–180 Hz；強拍根音',
      },
      vocal: {
        presence: vocalPresence,
        eqHint: `中頻＋中置（中心比 ${(center * 100).toFixed(0)}%）`,
        usedForRh: vocalDetect.likely,
      },
      melody: {
        presence: melodyPresence,
        eqHint: vocalDetect.likely ? '器樂主旋律（人聲優先時較弱）' : '中高頻主旋律',
        usedForRh: !vocalDetect.likely,
      },
      harmony: {
        presence: harmonyPresence,
        eqHint: '中頻持續（低暫態）→ 稀疏和弦音',
      },
      ornament: {
        presence: ornamentPresence,
        eqHint: `高頻／暫態（暫態比 ${trans.toFixed(2)}）`,
      },
    },
  }
}

/** Mixing-style gate: keep notes that pass presence × amplitude × role heuristics. */
export function gateNotesForRole(
  notes: RawPitchNote[],
  role: 'bass' | 'vocal' | 'melody' | 'harmony' | 'ornament',
  presence: number,
): RawPitchNote[] {
  const ampFloor = Math.max(0.08, 0.35 - presence * 0.2)
  switch (role) {
    case 'bass':
      return notes.filter(
        (n) => n.pitchMidi < 60 && n.amplitude >= ampFloor * 0.7 && n.durationSeconds >= 0.08,
      )
    case 'vocal':
    case 'melody':
      return notes.filter(
        (n) =>
          n.pitchMidi >= 48 &&
          n.pitchMidi <= 84 &&
          n.amplitude >= ampFloor &&
          n.durationSeconds >= 0.05,
      )
    case 'harmony':
      // Prefer mid register, longer sustains, drop weak shorts
      return notes.filter(
        (n) =>
          n.pitchMidi >= 48 &&
          n.pitchMidi <= 72 &&
          n.durationSeconds >= 0.2 &&
          n.amplitude >= ampFloor * 1.1,
      )
    case 'ornament':
      // Short / high / transient-ish leftovers
      return notes.filter(
        (n) =>
          n.pitchMidi >= 67 &&
          n.pitchMidi <= 88 &&
          n.durationSeconds < 0.28 &&
          n.amplitude >= ampFloor * 0.85,
      )
  }
}
