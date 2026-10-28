export interface RecordingResult {
  blob: Blob
  objectUrl: string
  durationSec: number
  mimeType: string
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
 * Constraints tuned for **music fingerprinting** (AudD), not voice calls.
 * echoCancellation / noiseSuppression / AGC are phone-call defaults that
 * muddy songs played from a speaker and hurt recognition + preview clarity.
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

/** ~128–192 kbps keeps music usable without huge uploads (AudD cap ~10 MB). */
const TARGET_AUDIO_BITS_PER_SECOND = 160_000

export class MicRecorder {
  private stream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('此瀏覽器不支援麥克風錄音')
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: musicAudioConstraints(),
    })
    this.chunks = []
    const mimeType = pickMimeType()
    const options: MediaRecorderOptions = {
      audioBitsPerSecond: TARGET_AUDIO_BITS_PER_SECOND,
    }
    if (mimeType) options.mimeType = mimeType

    try {
      this.mediaRecorder = new MediaRecorder(this.stream, options)
    } catch {
      // Some browsers reject bitrate + mime together; retry mime-only, then bare.
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
    // Timeslice only chunks the same stream; it does not re-encode.
    this.mediaRecorder.start(250)
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.mediaRecorder
    if (!recorder) throw new Error('尚未開始錄音')

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm'
        resolve(new Blob(this.chunks, { type: mime }))
      }
      recorder.onerror = () => reject(new Error('錄音失敗'))
      recorder.stop()
    })

    this.teardownStream()
    const durationSec = Math.max(0.5, (performance.now() - this.startedAt) / 1000)
    const objectUrl = URL.createObjectURL(blob)
    return {
      blob,
      objectUrl,
      durationSec,
      mimeType: blob.type,
    }
  }

  cancel(): void {
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
