/**
 * Demo analyzer — turns a recording into a playable RH melody + LH downbeat roots.
 *
 * This is intentionally labeled as a DEMO path so the UX loop works without
 * Basic Pitch WASM/ONNX. Swap point: replace `analyzeRecordingDemo` with a
 * Basic Pitch (or similar) pipeline that returns the same `Arrangement` shape.
 *
 * See README §「音高抽取」 for the swap checklist.
 */

import type { Arrangement, NoteEvent } from '../types/music'
import { clampMidi } from '../lib/notes'

const RH_SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76] // C4–E5 white-ish
const LH_ROOTS = [48, 43, 45, 41] // C3, G2, A2, F2 — I V vi IV feel

async function decodeAudio(blob: Blob): Promise<AudioBuffer | null> {
  try {
    const ctx = new AudioContext()
    const buf = await blob.arrayBuffer()
    const audio = await ctx.decodeAudioData(buf.slice(0))
    await ctx.close()
    return audio
  } catch {
    return null
  }
}

/** Rough onset / energy peaks → tempo guess. */
function estimateBpm(channel: Float32Array, sampleRate: number): number {
  const hop = Math.floor(sampleRate * 0.02)
  const energies: number[] = []
  for (let i = 0; i + hop < channel.length; i += hop) {
    let sum = 0
    for (let j = 0; j < hop; j++) {
      const s = channel[i + j]!
      sum += s * s
    }
    energies.push(sum / hop)
  }
  if (energies.length < 8) return 96

  const diffs: number[] = []
  for (let i = 1; i < energies.length; i++) {
    diffs.push(Math.max(0, energies[i]! - energies[i - 1]!))
  }
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length
  const threshold = mean * 1.6
  const peakIdx: number[] = []
  for (let i = 1; i < diffs.length - 1; i++) {
    if (diffs[i]! > threshold && diffs[i]! >= diffs[i - 1]! && diffs[i]! >= diffs[i + 1]!) {
      peakIdx.push(i)
    }
  }
  if (peakIdx.length < 3) return 96

  const intervals: number[] = []
  for (let i = 1; i < peakIdx.length; i++) {
    intervals.push((peakIdx[i]! - peakIdx[i - 1]!) * 0.02)
  }
  intervals.sort((a, b) => a - b)
  const mid = intervals[Math.floor(intervals.length / 2)] ?? 0.5
  let bpm = 60 / Math.max(0.25, mid)
  // Fold into a playable practice range
  while (bpm < 70) bpm *= 2
  while (bpm > 140) bpm /= 2
  return Math.round(bpm)
}

/** Tiny autocorrelation-ish pitch hint for variety (not production-grade). */
function roughPitchClass(channel: Float32Array, sampleRate: number): number {
  const start = Math.floor(channel.length * 0.2)
  const len = Math.min(Math.floor(sampleRate * 0.25), channel.length - start)
  if (len < 1024) return 0
  const slice = channel.subarray(start, start + len)
  let bestLag = 0
  let bestCorr = -Infinity
  const minLag = Math.floor(sampleRate / 500)
  const maxLag = Math.floor(sampleRate / 80)
  for (let lag = minLag; lag < maxLag; lag += 2) {
    let corr = 0
    for (let i = 0; i < len - lag; i += 4) {
      corr += slice[i]! * slice[i + lag]!
    }
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }
  if (!bestLag) return 0
  const freq = sampleRate / bestLag
  const midi = 69 + 12 * Math.log2(freq / 440)
  return ((Math.round(midi) % 12) + 12) % 12
}

function hashSeed(durationSec: number, pitchClass: number, title: string): number {
  let h = Math.floor(durationSec * 1000) ^ (pitchClass * 17)
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0
  return h || 1
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Build a short practice arrangement (8–16 measures) of RH single-line melody
 * + LH strong-beat roots only — Direction B difficulty caps.
 */
export async function analyzeRecordingDemo(
  blob: Blob,
  title: string,
  durationSecFallback: number,
): Promise<Arrangement> {
  const audio = await decodeAudio(blob)
  const durationSec = audio?.duration ?? durationSecFallback
  const channel = audio?.getChannelData(0) ?? new Float32Array(0)
  const sampleRate = audio?.sampleRate ?? 44100

  const bpm = channel.length ? estimateBpm(channel, sampleRate) : 96
  const pitchClass = channel.length ? roughPitchClass(channel, sampleRate) : 0
  const rand = mulberry32(hashSeed(durationSec, pitchClass, title))

  // Target ~20 min habit chunk → practice a short loopable excerpt first.
  const measureCount = Math.min(16, Math.max(8, Math.round(durationSec / 2)))
  const notes: NoteEvent[] = []

  let degree = 0
  for (let m = 0; m < measureCount; m++) {
    const root = LH_ROOTS[m % LH_ROOTS.length]!
    // LH: strong beats only — beat 1 always; beat 3 sometimes (1–2 hits / measure)
    notes.push({
      midi: clampMidi(root + pitchClass, 36, 55),
      startBeat: m * 4,
      durationBeats: 1.5,
      hand: 'lh',
    })
    if (rand() > 0.35) {
      notes.push({
        midi: clampMidi(root + pitchClass, 36, 55),
        startBeat: m * 4 + 2,
        durationBeats: 1.5,
        hand: 'lh',
      })
    }

    // RH: quantized single notes, max 1 simultaneous (Direction B)
    const density = 3 + Math.floor(rand() * 3) // 3–5 notes / measure
    const slots = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
    const chosen = slots
      .map((s) => ({ s, w: rand() }))
      .sort((a, b) => a.w - b.w)
      .slice(0, density)
      .map((x) => x.s)
      .sort((a, b) => a - b)

    for (const slot of chosen) {
      const step = Math.floor(rand() * 3) - 1 // -1,0,1
      degree = Math.max(0, Math.min(RH_SCALE.length - 1, degree + step))
      const midi = clampMidi(RH_SCALE[degree]! + (pitchClass % 5 === 0 ? 0 : 0), 48, 84)
      notes.push({
        midi,
        startBeat: m * 4 + slot,
        durationBeats: slot % 1 === 0 ? 0.9 : 0.45,
        hand: 'rh',
      })
    }
  }

  return {
    title,
    bpm,
    beatsPerMeasure: 4,
    measureCount,
    notes,
    analyzer: 'demo',
    sourceDurationSec: durationSec,
  }
}
