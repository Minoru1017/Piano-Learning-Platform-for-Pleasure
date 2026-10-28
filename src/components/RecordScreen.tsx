import { useEffect, useRef, useState } from 'react'
import { MicRecorder, type RecordingResult } from '../audio/recorder'

interface RecordScreenProps {
  onRecorded: (recording: RecordingResult) => void
  /** Mic-less path for local demos / environments without getUserMedia. */
  onLoadDemo?: () => void
}

export function RecordScreen({ onRecorded, onLoadDemo }: RecordScreenProps) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const recorderRef = useRef<MicRecorder | null>(null)
  const tickRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [])

  async function start() {
    setError(null)
    setBusy(true)
    try {
      const rec = new MicRecorder()
      recorderRef.current = rec
      await rec.start()
      setRecording(true)
      setElapsed(0)
      tickRef.current = window.setInterval(() => {
        setElapsed((e) => e + 0.1)
      }, 100)
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法開啟麥克風')
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    try {
      const result = await recorderRef.current!.stop()
      setRecording(false)
      onRecorded(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止錄音失敗')
      setRecording(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="screen screen--record">
      <div className="brand-block">
        <p className="brand">跟彈</p>
        <h1 className="headline">錄一段，立刻能跟</h1>
        <p className="lede">
          用麥克風錄下正在聽或哼的片段，辨出歌名後，從同一段錄音抽出右手旋律與左手根音，用小節循環練完。
        </p>
      </div>

      <div className="record-hero">
        <button
          type="button"
          className={`record-btn ${recording ? 'record-btn--live' : ''}`}
          onClick={() => void (recording ? stop() : start())}
          disabled={busy}
          aria-pressed={recording}
        >
          <span className="record-btn__ring" aria-hidden />
          <span className="record-btn__core" aria-hidden />
          <span className="record-btn__label">
            {recording ? '停止' : busy ? '準備中…' : '開始錄音'}
          </span>
        </button>
        <p className="record-meta" aria-live="polite">
          {recording
            ? `錄音中 ${elapsed.toFixed(1)}s — 建議 10–30 秒`
            : '不會上傳到串流曲庫；只用這次錄音本身抽旋律'}
        </p>
        {error && <p className="error">{error}</p>}
        {onLoadDemo && (
          <button type="button" className="btn btn--ghost" onClick={onLoadDemo}>
            沒麥克風？載入示範編曲
          </button>
        )}
      </div>
    </section>
  )
}
