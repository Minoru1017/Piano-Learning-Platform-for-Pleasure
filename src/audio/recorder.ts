import { cleanCaptureBlob } from './cleanCapture'
import {
  DisplayCaptureError,
  failReasonForNoAudio,
  requestDisplayStream,
} from './displayCapture'
import { peakNormalizeBlob } from './normalize'

export { DisplayCaptureError, DISPLAY_AUDIO_CHECKLIST_ZH } from './displayCapture'
export type { DisplayAudioFailReason, DisplaySurfaceKind } from './displayCapture'

/** Soft safety cap — full songs OK; UI documents this. */
export const MAX_RECORDING_SEC = 12 * 60 // 12 minutes

export type CaptureMode = 'mic' | 'display'

export interface RecordingResult {
  blob: Blob
  objectUrl: string
  durationSec: number
  mimeType: string
  /** Makeup gain applied after capture (1 = none). */
  normalizeGain?: number
  captureMode: CaptureMode
  /** Seconds of silence/hiss trimmed before musical onset (bar 1 reference). */
  musicStartOffsetSec: number
  /** Raw wall-clock capture length before trim. */
  rawDurationSec: number
}

/** Prefer Opus in WebM; fall back for Safari / older browsers. */
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
      return t
    }
  }
  return ''
}

/**
 * Constraints tuned for **music**, not voice calls.
 * Keep AGC / call DSP off so songs aren't smeared.
 */
function musicAudioConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
  }
}

/** ~128–192 kbps keeps music usable without huge uploads (AudD still gets a short slice). */
const TARGET_AUDIO_BITS_PER_SECOND = 160_000

export function displayAudioSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}

export class AudioCapture {
  private stream: MediaStream | null = null
  /** Display-capture video tracks held disabled so Chromium keeps the share alive. */
  private heldVideoTracks: MediaStreamTrack[] = []
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private mode: CaptureMode = 'mic'
  private maxTimer: number | null = null
  private onMaxReached: (() => void) | null = null

  async startMic(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('此瀏覽器不支援麥克風錄音')
    }
    this.mode = 'mic'
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: musicAudioConstraints(),
    })
    this.beginRecorder()
  }

  /**
   * Tab / system audio via getDisplayMedia.
   * Chromium: request audio + systemAudio; diagnose surface if tracks empty.
   * Does not preferCurrentTab (music is usually in another tab).
   */
  async startDisplay(): Promise<void> {
    this.mode = 'display'
    const { stream: raw, displaySurface } = await requestDisplayStream()

    const audioTracks = raw.getAudioTracks().filter((t) => t.readyState !== 'ended')

    if (!audioTracks.length) {
      // Read surface from video first, then tear down — never leave a ghost share.
      raw.getTracks().forEach((t) => t.stop())
      throw new DisplayCaptureError(failReasonForNoAudio(displaySurface), displaySurface)
    }

    // Hold video disabled (do not stop): some Chromium builds end the whole
    // capture session — including audio — when the video track is stopped early.
    this.heldVideoTracks = raw.getVideoTracks()
    for (const vt of this.heldVideoTracks) {
      try {
        vt.enabled = false
      } catch {
        /* ignore */
      }
    }

    for (const at of audioTracks) {
      at.enabled = true
    }

    this.stream = new MediaStream(audioTracks)
    audioTracks[0]!.addEventListener('ended', () => {
      this.onMaxReached?.()
    })
    this.beginRecorder()
  }

  /** Register auto-stop when safety max (12 min) is hit. */
  setMaxDurationHandler(cb: () => void): void {
    this.onMaxReached = cb
  }

  private beginRecorder(): void {
    if (!this.stream) throw new Error('沒有音訊串流')
    this.chunks = []
    const mimeType = pickMimeType()
    const options: MediaRecorderOptions = {
      audioBitsPerSecond: TARGET_AUDIO_BITS_PER_SECOND,
    }
    if (mimeType) options.mimeType = mimeType

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options)
    } catch {
      try {
        this.mediaRecorder = mimeType
          ? new MediaRecorder(this.stream, { mimeType })
          : new MediaRecorder(this.stream)
      } catch {
        this.mediaRecorder = new MediaRecorder(this.stream)
      }
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.startedAt = performance.now()
    this.mediaRecorder.start(250)

    if (this.maxTimer) window.clearTimeout(this.maxTimer)
    this.maxTimer = window.setTimeout(() => {
      this.onMaxReached?.()
    }, MAX_RECORDING_SEC * 1000)
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.mediaRecorder
    if (!recorder) throw new Error('尚未開始錄音')

    if (this.maxTimer) {
      window.clearTimeout(this.maxTimer)
      this.maxTimer = null
    }

    const rawBlob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm'
        resolve(new Blob(this.chunks, { type: mime }))
      }
      recorder.onerror = () => reject(new Error('錄音失敗'))
      recorder.stop()
    })

    this.teardownStream()
    const rawDurationSec = Math.max(0.5, (performance.now() - this.startedAt) / 1000)

    // Trim silence/hiss; bar 1 = musical onset.
    const cleaned = await cleanCaptureBlob(rawBlob)
    if (cleaned.durationSec < 0.35) {
      throw new Error('幾乎沒偵測到音樂（可能只錄到環境底噪）。請靠近音源或改用「螢幕／分頁音訊」。')
    }

    const normalized = await peakNormalizeBlob(cleaned.blob)
    const objectUrl = URL.createObjectURL(normalized.blob)
    return {
      blob: normalized.blob,
      objectUrl,
      durationSec: cleaned.durationSec || rawDurationSec,
      mimeType: normalized.blob.type,
      normalizeGain: normalized.gain,
      captureMode: this.mode,
      musicStartOffsetSec: cleaned.musicStartOffsetSec,
      rawDurationSec,
    }
  }

  cancel(): void {
    if (this.maxTimer) {
      window.clearTimeout(this.maxTimer)
      this.maxTimer = null
    }
    try {
      this.mediaRecorder?.stop()
    } catch {
      /* ignore */
    }
    this.teardownStream()
    this.chunks = []
  }

  private teardownStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    for (const vt of this.heldVideoTracks) {
      try {
        vt.stop()
      } catch {
        /* ignore */
      }
    }
    this.heldVideoTracks = []
    this.mediaRecorder = null
  }
}

/** @deprecated alias — prefer AudioCapture */
export const MicRecorder = AudioCapture
