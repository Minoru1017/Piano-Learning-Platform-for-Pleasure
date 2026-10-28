export interface RecordingResult {
  blob: Blob
  objectUrl: string
  durationSec: number
  mimeType: string
}

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
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    this.chunks = []
    const mimeType = pickMimeType()
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream)

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.startedAt = performance.now()
    this.mediaRecorder.start(200)
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
