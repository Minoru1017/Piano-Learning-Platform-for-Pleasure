import { useEffect, useRef, useState } from 'react'
import {
  AudioCapture,
  DISPLAY_AUDIO_CHECKLIST_ZH,
  DisplayCaptureError,
  displayAudioSupported,
  MAX_RECORDING_SEC,
  type CaptureMode,
  type DisplayAudioFailReason,
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
  const [displayFail, setDisplayFail] = useState<DisplayAudioFailReason | null>(null)
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

  async function start(forceMode?: CaptureMode) {
    const useMode = forceMode ?? mode
    setError(null)
    setInfo(null)
    if (useMode !== 'display') setDisplayFail(null)
    setBusy(true)
    try {
      const rec = new AudioCapture()
      recorderRef.current = rec
      rec.setMaxDurationHandler(() => {
        void stop(true)
      })
      if (useMode === 'display') {
        await rec.startDisplay()
        setDisplayFail(null)
        setInfo('已連上分頁／系統音訊。請保持分享開啟，播完要錄的段落後按停止。')
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
      recorderRef.current?.cancel()
      recorderRef.current = null
      if (e instanceof DisplayCaptureError) {
        setDisplayFail(e.reason)
        setError(e.message)
      } else {
        setDisplayFail(null)
        setError(e instanceof Error ? e.message : '無法開始錄音')
      }
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

  function retryDisplay() {
    setMode('display')
    setDisplayFail(null)
    setError(null)
    void start('display')
  }

  const idleCurve = recording
    ? [0.25, 0.4, 0.55, 0.7, 0.62, 0.48, 0.35, 0.42].map(
        (v, i) => v * (0.7 + Math.sin(elapsed * 3 + i) * 0.15),
      )
    : [0.2, 0.28, 0.32, 0.3, 0.26, 0.22, 0.2, 0.24]

  const maxMin = MAX_RECORDING_SEC / 60
  const showDisplayHelp = mode === 'display' && !recording
  const showRetryPanel =
    displayFail === 'no-audio-tab' ||
    displayFail === 'no-audio-window' ||
    displayFail === 'no-audio-monitor' ||
    displayFail === 'no-audio-unknown' ||
    displayFail === 'cancelled'

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
                onClick={() => {
                  setMode('mic')
                  setDisplayFail(null)
                  setError(null)
                }}
                aria-pressed={mode === 'mic'}
              >
                麥克風
              </button>
              <button
                type="button"
                className={`chip ${mode === 'display' ? 'chip--on' : ''}`}
                disabled={recording || busy || !displayOk}
                onClick={() => {
                  setMode('display')
                  setError(null)
                }}
                aria-pressed={mode === 'display'}
                title={
                  displayOk
                    ? 'Chrome／Edge：分享正在播歌的分頁並勾選音訊'
                    : '此瀏覽器不支援 getDisplayMedia'
                }
              >
                螢幕／分頁音訊
              </button>
            </div>
            <p className="record-meta">
              {mode === 'mic'
                ? '麥克風：適合喇叭外放；請靠近音源。通話降噪／AGC 已關閉。'
                : '螢幕／分頁音訊：適合耳機聽歌。請選「正在播歌的 Chrome 分頁」並勾選「分享分頁音訊」（不要分享本頁）。'}
            </p>
          </div>

          {showDisplayHelp && !showRetryPanel && (
            <ol className="capture-checklist" aria-label="分頁音訊三步驟">
              <li>用 Chrome／Edge 打開正在播歌的分頁</li>
              <li>按下方錄音 → 對話框選「分頁」→ 選該分頁</li>
              <li>勾選「分享分頁音訊」再按分享</li>
            </ol>
          )}

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
          {error && !showRetryPanel && <p className="error">{error}</p>}

          {showRetryPanel && (
            <div className="capture-retry" role="alert">
              <p className="capture-retry__title">{error}</p>
              <p className="capture-retry__lead">請照下列檢查後再試一次（不會卡住）：</p>
              <ol className="capture-checklist">
                {DISPLAY_AUDIO_CHECKLIST_ZH.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => retryDisplay()}
                >
                  再試一次（分頁音訊）
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => {
                    setMode('mic')
                    setDisplayFail(null)
                    setError(null)
                  }}
                >
                  改用麥克風
                </button>
              </div>
            </div>
          )}

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
