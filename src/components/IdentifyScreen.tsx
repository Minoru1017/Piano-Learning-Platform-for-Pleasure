import { useEffect, useState } from 'react'
import type { RecordingResult } from '../audio/recorder'
import { analyzeRecordingDemo } from '../audio/demoAnalyzer'
import { identifySong, isAuddConfigured, type SongIdConfidence } from '../audio/songIdentify'
import type { Arrangement } from '../types/music'

interface IdentifyScreenProps {
  recording: RecordingResult
  onReady: (arrangement: Arrangement) => void
  onBack: () => void
}

export function IdentifyScreen({ recording, onReady, onBack }: IdentifyScreenProps) {
  const [title, setTitle] = useState('')
  const [statusNote, setStatusNote] = useState(
    isAuddConfigured() ? '正在經 AudD 代理辨識歌名…' : '正在 stub 辨識歌名…',
  )
  const [confidence, setConfidence] = useState<SongIdConfidence | null>(null)
  const [identifying, setIdentifying] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await identifySong(recording.blob, recording.durationSec)
        if (cancelled) return
        setTitle(result.suggestedTitle)
        setStatusNote(result.note)
        setConfidence(result.confidence)
      } catch (e) {
        if (!cancelled) {
          setTitle('')
          setConfidence('fallback')
          setStatusNote('辨識失敗，請手動輸入歌名後繼續。')
          setError(e instanceof Error ? e.message : '辨識失敗')
        }
      } finally {
        if (!cancelled) setIdentifying(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recording])

  async function continueToPractice() {
    const trimmed = title.trim() || '未命名練習'
    setAnalyzing(true)
    setError(null)
    try {
      const arrangement = await analyzeRecordingDemo(
        recording.blob,
        trimmed,
        recording.durationSec,
      )
      onReady(arrangement)
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失敗')
      setAnalyzing(false)
    }
  }

  const bannerClass =
    confidence === 'audd'
      ? 'stub-banner stub-banner--ok'
      : confidence === 'fallback' || confidence === 'audd-nomatch'
        ? 'stub-banner stub-banner--warn'
        : 'stub-banner'

  return (
    <section className="screen screen--identify">
      <div className="brand-block brand-block--compact">
        <p className="brand">跟彈</p>
        <h1 className="headline">這是哪一首？</h1>
        <p className="lede">
          可用 AudD 自動填入歌名，<strong>一律可手動修改</strong>。確認後會用
          <strong>同一段錄音</strong>抽出 RH 旋律＋LH 根音（demo 分析器）。
        </p>
      </div>

      <div className="identify-panel">
        <audio className="playback-audio" src={recording.objectUrl} controls />
        <label className="field">
          <span className="field__label">歌名（可手動編輯）</span>
          <input
            className="field__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={identifying || analyzing}
            placeholder={identifying ? '辨識中…' : '輸入或修改歌名'}
            autoFocus
          />
        </label>
        <p className={bannerClass} role="status">
          {statusNote}
        </p>
        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="button" className="btn btn--ghost" onClick={onBack} disabled={analyzing}>
            重新錄音
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void continueToPractice()}
            disabled={identifying || analyzing || !title.trim()}
          >
            {analyzing ? '抽出旋律中…' : '抽出並開始跟彈'}
          </button>
        </div>
      </div>
    </section>
  )
}
