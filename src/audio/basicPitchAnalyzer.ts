/**
 * Spotify Basic Pitch (TFJS + WASM) → Direction B arrangement.
 * RH: prefer vocals when detected, else instrumental/predominant melody.
 * LH: roots from the full mix. Model weights in `public/basic-pitch/`.
 */
import {
  BasicPitch,
  addPitchBendsToNoteEvents,
  noteFramesToTime,
  outputToNotesPoly,
} from '@spotify/basic-pitch'
import * as tf from '@tensorflow/tfjs'
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm'
import type { Arrangement } from '../types/music'
import { arrangeDirectionBParts, type RawPitchNote } from './arrangeFromPitch'
import { toBasicPitchAudioBuffer } from './resample'
import { buildRhSourceBuffer } from './vocalPrefer'

let backendReady: Promise<void> | null = null
let modelPromise: Promise<BasicPitch> | null = null

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${path.replace(/^\//, '')}`
}

async function ensureTfBackend(): Promise<void> {
  if (!backendReady) {
    backendReady = (async () => {
      setWasmPaths(assetUrl('tfjs-wasm/'))
      try {
        await tf.setBackend('wasm')
      } catch {
        await tf.setBackend('webgl')
      }
      await tf.ready()
    })()
  }
  await backendReady
}

async function getModel(): Promise<BasicPitch> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await ensureTfBackend()
      return new BasicPitch(assetUrl('basic-pitch/model.json'))
    })()
  }
  return modelPromise
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    const bytes = await blob.arrayBuffer()
    return await ctx.decodeAudioData(bytes.slice(0))
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

async function runBasicPitch(
  model: BasicPitch,
  buffer: AudioBuffer,
  onPct: (p: number) => void,
): Promise<RawPitchNote[]> {
  // Mic capture is often 44100/48000; evaluateModel requires mono @ 22050.
  const bpInput = toBasicPitchAudioBuffer(buffer)
  const frames: number[][] = []
  const onsets: number[][] = []
  const contours: number[][] = []
  await model.evaluateModel(
    bpInput,
    (f, o, c) => {
      frames.push(...f)
      onsets.push(...o)
      contours.push(...c)
    },
    onPct,
  )
  const poly = outputToNotesPoly(frames, onsets, 0.5, 0.3, 5)
  const withBends = addPitchBendsToNoteEvents(contours, poly)
  const timed = noteFramesToTime(withBends)
  return timed.map((n) => ({
    startTimeSeconds: n.startTimeSeconds,
    durationSeconds: Math.max(0.05, n.durationSeconds),
    pitchMidi: Math.round(n.pitchMidi),
    amplitude: n.amplitude,
  }))
}

export type ProgressCb = (percent: number, label: string) => void

export async function analyzeRecordingBasicPitch(
  blob: Blob,
  title: string,
  durationSecFallback: number,
  onProgress?: ProgressCb,
): Promise<Arrangement> {
  onProgress?.(0.05, '載入 Basic Pitch 模型…')
  const model = await getModel()
  onProgress?.(0.12, '解碼錄音…')
  const audio = await decodeBlob(blob)
  const durationSec = audio.duration || durationSecFallback

  onProgress?.(0.16, '判斷是否有人聲（優先采人聲）…')
  const rhPlan = buildRhSourceBuffer(audio)

  onProgress?.(
    0.2,
    rhPlan.source === 'vocal'
      ? 'Basic Pitch：人聲取向音軌（RH）…'
      : 'Basic Pitch：器樂／主旋律（RH）…',
  )
  const rhNotes = await runBasicPitch(model, rhPlan.buffer, (p) => {
    onProgress?.(0.2 + p * 0.45, 'Basic Pitch 推論 RH…')
  })

  // LH roots from the full mix (accompaniment / bass), not the vocal stem.
  onProgress?.(0.68, 'Basic Pitch：全混音估計左手根音…')
  let lhNotes: RawPitchNote[]
  if (rhPlan.source === 'vocal') {
    lhNotes = await runBasicPitch(model, audio, (p) => {
      onProgress?.(0.68 + p * 0.22, 'Basic Pitch 推論 LH…')
    })
  } else {
    // Same pass already tracked the mix — reuse RH notes for LH lows.
    lhNotes = rhNotes
  }

  onProgress?.(0.92, '整理成右手單音＋左手強拍根音…')
  const primary = rhNotes.length >= 2 ? rhNotes : lhNotes
  if (primary.length < 2) {
    throw new Error('Basic Pitch 幾乎沒偵測到音符（錄音可能太短或太安靜）')
  }

  const srcLabel =
    rhPlan.source === 'vocal'
      ? `偵測到偏人聲（信心 ${rhPlan.detect.confidence.toFixed(2)}）→ RH 只采人聲取向音軌`
      : `未明顯偵測人聲（信心 ${rhPlan.detect.confidence.toFixed(2)}）→ RH 采器樂／主旋律`

  return arrangeDirectionBParts({
    rhNotes: rhNotes.length >= 2 ? rhNotes : lhNotes,
    lhNotes,
    title,
    sourceDurationSec: durationSec,
    analyzer: 'basic-pitch',
    preferVocalRange: rhPlan.source === 'vocal',
    analyzerNote: `${srcLabel}；LH 根音仍來自全混音。中置分離為啟發式（非 Demucs），混音／單聲道喇叭錄音仍可能有出入。`,
  })
}
