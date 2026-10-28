/**
 * Web-friendly BPM detector via energy-envelope autocorrelation.
 * No native aubio / Demucs — runs fully in-browser for GitHub Pages.
 *
 * Limits: rubato, sparse onsets, and highly compressed pop can bias ±5–15 BPM
 * or land on half/double tempo (we clamp + snap to common range).
 */

import { mixToMono } from './resample'
import type { BpmSource } from '../types/music'

export interface BpmResult {
  bpm: number
  confidence: number
  source: BpmSource
}

function energyEnvelope(mono: Float32Array, sampleRate: number): {
  env: Float32Array
  hop: number
} {
  const hop = Math.max(1, Math.floor(sampleRate * 0.01)) // 10 ms
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
  // First-difference (onset emphasis) + half-wave
  const diff = new Float32Array(n)
  for (let i = 1; i < n; i++) {
    diff[i] = Math.max(0, env[i]! - env[i - 1]!)
  }
  return { env: diff, hop }
}

function autocorrelate(env: Float32Array, minLag: number, maxLag: number): {
  bestLag: number
  bestScore: number
} {
  let bestLag = minLag
  let bestScore = -1
  const n = env.length
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    let count = 0
    for (let i = 0; i + lag < n; i++) {
      sum += env[i]! * env[i + lag]!
      count++
    }
    const score = count ? sum / count : 0
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  return { bestLag, bestScore }
}

function snapCommonTempo(bpm: number): number {
  // Prefer integer BPM in a playable practice range
  let b = bpm
  while (b < 70) b *= 2
  while (b > 160) b /= 2
  return Math.round(Math.min(160, Math.max(70, b)))
}

/**
 * Detect BPM from an AudioBuffer using onset-energy autocorrelation.
 */
export function detectBpm(buffer: AudioBuffer): BpmResult {
  const mono = mixToMono(buffer)
  const { env, hop } = energyEnvelope(mono, buffer.sampleRate)
  if (env.length < 64) {
    return { bpm: 96, confidence: 0.15, source: 'audio-autocorr' }
  }

  const fps = buffer.sampleRate / hop
  // Lag for 70–160 BPM
  const minLag = Math.floor(fps * (60 / 160))
  const maxLag = Math.min(env.length - 2, Math.ceil(fps * (60 / 70)))
  if (maxLag <= minLag) {
    return { bpm: 96, confidence: 0.2, source: 'audio-autocorr' }
  }

  const { bestLag, bestScore } = autocorrelate(env, minLag, maxLag)
  const rawBpm = (60 * fps) / bestLag
  const bpm = snapCommonTempo(rawBpm)

  // Confidence: peak strength vs mean of nearby lags (crude)
  let neighbor = 0
  let nn = 0
  for (let lag = minLag; lag <= maxLag; lag += Math.max(1, Math.floor((maxLag - minLag) / 32))) {
    let sum = 0
    let count = 0
    for (let i = 0; i + lag < env.length; i++) {
      sum += env[i]! * env[i + lag]!
      count++
    }
    neighbor += count ? sum / count : 0
    nn++
  }
  const mean = nn ? neighbor / nn : 1e-9
  const confidence = Math.max(0.1, Math.min(0.95, (bestScore / (mean + 1e-12) - 1) / 3))

  return { bpm, confidence, source: 'audio-autocorr' }
}
