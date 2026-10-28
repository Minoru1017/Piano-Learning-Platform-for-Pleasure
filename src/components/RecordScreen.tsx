import { useEffect, useRef, useState } from 'react'
import {
  AudioCapture,
  displayAudioSupported,
  MAX_RECORDING_SEC,
  type CaptureMode,
  type RecordingResult,
} from '../audio/recorder'
import { SoftEqCurve } from './SoftEqCurve'

interface RecordScreenProps {
  onRecorded: (recording: RecordingResult) => void
  /** Mic-less path for local demos / environments without getUserMedia. */
  onLoadDemo?: () => void
}

export function RecordScreen({ onRecorded, onLoadDemo }: RecordScreenProps) {
  const [mode, setMode] = useState<CaptureMode>('mic')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const recorderRef = useRef<AudioCapture | null>(null)
  const tickRef = useRef<number | null>(null)
  const displayOk = displayAudioSupported()

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel()
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [])

  function clearTick() {
    if (tickRef.current) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  async function start() {
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      const rec = new AudioCapture()
      recorderRef.current = rec
      rec.setMaxDurationHandler(() => {
        void stop(true)
      })
      if (mode === 'display') {
        await rec.startDisplay()
        setInfo('正在擷取分頁／系統音訊。耳機聽歌也可錄——請確認已勾選分享音訊。')
      } else {
        await rec.startMic()
      }
      setRecording(true)
      setElapsed(0)
      tickRef.current = window.setInterval(() => {
        setElapsed((e) => {
          const next = e + 0.1
          if (next >= MAX_RECORDING_SEC) {
            void stop(true)
          }
          return next
        })
      }, 100)
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法開始錄音')
      recorderRef.current?.cancel()
      recorderRef.current = null
    } finally {
      setBusy(false)
    }
  }

  async function stop(hitMax = false) {
    if (!recorderRef.current) return
    setBusy(true)
    clearTick()
    try {
      const result = await recorderRef.current.stop()
      recorderRef.current = null
      setRecording(false)
      if (hitMax) {
        setInfo(`已達安全上限 ${MAX_RECORDING_SEC / 60} 分鐘，自動停止並保留完整音樂段。`)
      }
      onRecorded(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止錄音失敗')
      setRecording(false)
      recorderRef.current = null
    } finally {
      setBusy(false)
    }
  }

  const idleCurve = recording
    ? [0.25, 0.4, 0.55, 0.7, 0.62, 0.48, 0.35, 0.42].map(
        (v, i) => v * (0.7 + Math.sin(elapsed * 3 + i) * 0.15),
      )
    : [0.2, 0.28, 0.32, 0.3, 0.26, 0.22, 0.2, 0.24]

  const maxMin = MAX_RECORDING_SEC / 60

  return (
    <section className="screen screen--record">
      <div className="record-layout">
        <div className="brand-block">
          <p className="atelier-mark">White piano · soft crystal</p>
          <p className="brand">跟彈</p>
          <h1 className="headline">坐在白鋼琴旁，環境隨情緒呼吸</h1>
          <p className="lede">
            錄下整首歌（或你要的長度）；開頭靜音與底噪會自動裁切，小節 1 對齊音樂起點。可用麥克風，或用螢幕／分頁音訊在耳機聽歌時擷取。
          </p>
        </div>

        <div className="record-hero">
          <div className="capture-mode" role="group" aria-label="錄音來源">
            <p className="section-label">錄音來源</p>
            <div className="layer-controls__chips">
              <button
                type="button"
                className={`chip ${mode === 'mic' ? 'chip--on' : ''}`}
                disabled={recording || busy}
                onClick={() => setMode('mic')}
                aria-pressed={mode === 'mic'}
              >
                麥克風
              </button>
              <button
                type="button"
                className={`chip ${mode === 'display' ? 'chip--on' : ''}`}
                disabled={recording || busy || !displayOk}
                onClick={() => setMode('display')}
                aria-pressed={mode === 'display'}
                title={
                  displayOk
                    ? 'Chrome／Edge：分享分頁並勾選音訊'
                    : '此瀏覽器不支援 getDisplayMedia'
                }
              >
                螢幕／分頁音訊
              </button>
            </div>
            <p className="record-meta">
              {mode === 'mic'
                ? '麥克風：適合喇叭外放；請靠近音源。通話降噪／AGC 已關閉。'
                : '螢幕／分頁音訊：適合耳機聽歌。Chrome／Edge 請選分頁並勾選「分享分頁音訊」；Safari 多半無音軌，請改麥克風。'}
            </p>
          </div>

          <button
            type="button"
            className={`record-btn ${recording ? 'record-btn--live' : ''}`}
            onClick={() => void (recording ? stop(false) : start())}
            disabled={busy}
            aria-pressed={recording}
          >
            <span className="record-btn__ring" aria-hidden />
            <span className="record-btn__core" aria-hidden />
            <span className="record-btn__label">
              {recording ? '停止' : busy ? '準備中…' : '開始錄音'}
            </span>
          </button>
          <SoftEqCurve values={idleCurve} label="Listening field" />
          <p className="record-meta" aria-live="polite">
            {recording
              ? `錄音中 ${formatClock(elapsed)} — 可錄完整曲（安全上限 ${maxMin} 分鐘）；停止後會去掉開頭／尾端靜音與底噪`
              : `完整長度保留（上限 ${maxMin} 分鐘）。不會把房間底噪當音符；AudD 只用開頭一小段辨歌。`}
          </p>
          {info && (
            <p className="stub-banner stub-banner--ok" role="status">
              {info}
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {onLoadDemo && (
            <button type="button" className="btn btn--ghost" onClick={onLoadDemo}>
              沒麥克風？載入示範編曲
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function formatClock(sec: number): string {
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
