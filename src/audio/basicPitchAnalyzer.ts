/**
 * Spotify Basic Pitch (TFJS + WASM) → Direction B layered arrangement.
 * BPM from audio autocorrelation; stems via band/stereo/transient heuristics;
 * RH: vocals first else instrumental melody; LH: bass roots; optional harmony/ornament.
 * Model weights in `public/basic-pitch/`.
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
import { detectBpm } from './bpm'
import { toBasicPitchAudioBuffer } from './resample'
import { characterizeStems } from './stemCharacterize'
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
  musicStartOffsetSec = 0,
): Promise<Arrangement> {
  onProgress?.(0.04, '載入 Basic Pitch 模型…')
  const model = await getModel()
  onProgress?.(0.1, '解碼錄音…')
  const audio = await decodeBlob(blob)
  const durationSec = audio.duration || durationSecFallback

  onProgress?.(0.14, '偵測 BPM…')
  const bpmResult = detectBpm(audio)

  onProgress?.(0.18, '分層特徵化（BASS／人聲／主旋律／和聲／點綴）…')
  const { stems, vocalDetect } = characterizeStems(audio)
  const rhPlan = buildRhSourceBuffer(audio)

  onProgress?.(
    0.22,
    rhPlan.source === 'vocal'
      ? 'Basic Pitch：人聲取向音軌（RH）…'
      : 'Basic Pitch：器樂／主旋律（RH）…',
  )
  const rhNotes = await runBasicPitch(model, rhPlan.buffer, (p) => {
    onProgress?.(0.22 + p * 0.42, 'Basic Pitch 推論 RH…')
  })

  onProgress?.(0.66, 'Basic Pitch：全混音（BASS／和聲／點綴）…')
  let mixNotes: RawPitchNote[]
  if (rhPlan.source === 'vocal') {
    mixNotes = await runBasicPitch(model, audio, (p) => {
      onProgress?.(0.66 + p * 0.22, 'Basic Pitch 推論混音…')
    })
  } else {
    mixNotes = rhNotes
  }

  onProgress?.(0.9, '映射為可跟彈鋼琴層…')
  const primary = rhNotes.length >= 2 ? rhNotes : mixNotes
  if (primary.length < 2) {
    throw new Error('Basic Pitch 幾乎沒偵測到音符（錄音可能太短或太安靜）')
  }

  const rhRole = rhPlan.source === 'vocal' ? 'vocal' : 'melody'
  const srcLabel =
    rhPlan.source === 'vocal'
      ? `偵測到偏人聲（信心 ${vocalDetect.confidence.toFixed(2)}）→ RH＝人聲`
      : `未明顯偵測人聲（信心 ${vocalDetect.confidence.toFixed(2)}）→ RH＝主旋律`

  const stemBrief = [
    `BASS ${stems.bass.presence.toFixed(2)}`,
    `人聲 ${stems.vocal.presence.toFixed(2)}`,
    `主旋律 ${stems.melody.presence.toFixed(2)}`,
    `和聲 ${stems.harmony.presence.toFixed(2)}`,
    `點綴 ${stems.ornament.presence.toFixed(2)}`,
  ].join(' · ')

  const onsetNote =
    musicStartOffsetSec > 0.05
      ? `小節 1＝音樂起點（已裁切開頭靜音 ${musicStartOffsetSec.toFixed(2)}s）；`
      : `小節 1＝音樂起點（開頭靜音已去除）；`

  return arrangeDirectionBParts({
    rhNotes: rhNotes.length >= 2 ? rhNotes : mixNotes,
    lhNotes: mixNotes,
    mixNotes,
    title,
    sourceDurationSec: durationSec,
    musicStartOffsetSec,
    analyzer: 'basic-pitch',
    preferVocalRange: rhPlan.source === 'vocal',
    rhRole,
    bpm: bpmResult.bpm,
    bpmSource: bpmResult.source,
    stems,
    analyzerNote: `${onsetNote}${srcLabel}；BPM ${bpmResult.bpm}（信心 ${bpmResult.confidence.toFixed(2)}）。分層為頻段／中置／暫態啟發式（非 Demucs）：${stemBrief}。混音特徵僅作進譜閘，非專業分軌；點綴預設關閉。`,
  })
}
