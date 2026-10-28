/**
 * Spotify Basic Pitch (TFJS + WASM) → Direction B arrangement.
 * Model weights live in `public/basic-pitch/` (copied from @spotify/basic-pitch).
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
import { arrangeDirectionB, type RawPitchNote } from './arrangeFromPitch'
import { toBasicPitchAudioBuffer } from './resample'

let backendReady: Promise<void> | null = null
let modelPromise: Promise<BasicPitch> | null = null

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}${path.replace(/^\//, '')}`
}

async function ensureTfBackend(): Promise<void> {
  if (!backendReady) {
    backendReady = (async () => {
      // Prefer WASM for consistent results across GPUs (see basic-pitch issue #143).
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

export type ProgressCb = (percent: number, label: string) => void

export async function analyzeRecordingBasicPitch(
  blob: Blob,
  title: string,
  durationSecFallback: number,
  onProgress?: ProgressCb,
): Promise<Arrangement> {
  onProgress?.(0.05, '載入 Basic Pitch 模型…')
  const model = await getModel()
  onProgress?.(0.15, '解碼錄音…')
  const audio = await decodeBlob(blob)
  const durationSec = audio.duration || durationSecFallback

  // Mic capture is often 44100/48000; BasicPitch.evaluateModel requires mono @ 22050.
  onProgress?.(0.18, '重採樣至 22050 Hz（單聲道）…')
  const bpInput = toBasicPitchAudioBuffer(audio)

  const frames: number[][] = []
  const onsets: number[][] = []
  const contours: number[][] = []

  onProgress?.(0.2, 'Basic Pitch 推論中…')
  await model.evaluateModel(
    bpInput,
    (f, o, c) => {
      frames.push(...f)
      onsets.push(...o)
      contours.push(...c)
    },
    (p) => {
      onProgress?.(0.2 + p * 0.7, 'Basic Pitch 推論中…')
    },
  )

  onProgress?.(0.92, '整理成右手旋律＋左手根音…')
  const poly = outputToNotesPoly(frames, onsets, 0.5, 0.3, 5)
  const withBends = addPitchBendsToNoteEvents(contours, poly)
  const timed = noteFramesToTime(withBends)

  const raw: RawPitchNote[] = timed.map((n) => ({
    startTimeSeconds: n.startTimeSeconds,
    durationSeconds: Math.max(0.05, n.durationSeconds),
    pitchMidi: Math.round(n.pitchMidi),
    amplitude: n.amplitude,
  }))

  if (raw.length < 2) {
    throw new Error('Basic Pitch 幾乎沒偵測到音符（錄音可能太短或太安靜）')
  }

  return arrangeDirectionB(
    raw,
    title,
    durationSec,
    'basic-pitch',
    '已用 Basic Pitch 從這段錄音估計音高，再收成 RH 單音＋LH 強拍根音。混音／多軌原曲仍可能有出入。',
  )
}
