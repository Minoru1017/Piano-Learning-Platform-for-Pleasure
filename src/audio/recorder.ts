import { cleanCaptureBlob } from './cleanCapture'
import { peakNormalizeBlob } from './normalize'

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
   * Chrome: choose a tab and enable「分享分頁音訊」.
   * Safari / some browsers: often no audio track — we surface a clear error.
   */
  async startDisplay(): Promise<void> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('此瀏覽器不支援螢幕／分頁音訊擷取（getDisplayMedia）')
    }
    this.mode = 'display'
    let raw: MediaStream
    try {
      raw = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '使用者取消或拒絕分享'
      throw new Error(`無法開始螢幕／分頁音訊：${msg}`)
    }

    const audioTracks = raw.getAudioTracks()
    // Drop video ASAP — we only need audio for the song.
    raw.getVideoTracks().forEach((t) => t.stop())

    if (!audioTracks.length) {
      raw.getTracks().forEach((t) => t.stop())
      throw new Error(
        '沒有收到音軌。請改用 Chrome／Edge，分享「分頁」並勾選「分享分頁音訊」；Safari 通常無法擷取分頁聲音，請改用麥克風或換瀏覽器。',
      )
    }

    this.stream = new MediaStream(audioTracks)
    audioTracks[0]!.addEventListener('ended', () => {
      // User stopped sharing from browser chrome
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
    this.mediaRecorder = null
  }
}

/** @deprecated alias — prefer AudioCapture */
export const MicRecorder = AudioCapture
