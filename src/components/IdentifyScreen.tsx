import { useEffect, useState } from 'react'
import type { RecordingResult } from '../audio/recorder'
import { analyzeRecording } from '../audio/analyzeRecording'
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
  const [analyzeLabel, setAnalyzeLabel] = useState('')
  const [analyzePct, setAnalyzePct] = useState(0)
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
    setAnalyzePct(0)
    setAnalyzeLabel('準備抽出旋律…')
    try {
      const arrangement = await analyzeRecording(
        recording.blob,
        trimmed,
        recording.durationSec,
        (pct, label) => {
          setAnalyzePct(pct)
          setAnalyzeLabel(label)
        },
        recording.musicStartOffsetSec ?? 0,
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
        <p className="atelier-mark">White piano · soft crystal</p>
        <p className="brand">跟彈</p>
        <h1 className="headline">這是哪一首？</h1>
        <p className="lede">
          可用 AudD 自動填入歌名，<strong>一律可手動修改</strong>。確認後以
          <strong>簡易（Easy）</strong>
          采音：同一段錄音抽出可彈素材——
          <strong>有人聲 → 右手只采人聲單音；無人聲 → 主旋律單音（不重疊）</strong>
          ；左手強拍根音（Basic Pitch；失敗則降級示範分析器並標示）。
        </p>
      </div>

      <div className="identify-panel">
        <audio
          className="playback-audio"
          src={recording.objectUrl}
          controls
          preload="auto"
          ref={(el) => {
            if (el) el.volume = 1
          }}
        />
        <p className="record-meta">
          來源：{recording.captureMode === 'display' ? '螢幕／分頁音訊' : '麥克風'}
          {recording.musicStartOffsetSec > 0.05
            ? ` · 已裁切開頭靜音 ${recording.musicStartOffsetSec.toFixed(1)}s（小節 1＝音樂起點）`
            : ' · 小節 1＝音樂起點'}
          {' · '}
          音樂長度 {recording.durationSec.toFixed(1)}s
          {recording.rawDurationSec > recording.durationSec + 0.2
            ? `（原始 ${recording.rawDurationSec.toFixed(1)}s）`
            : ''}
        </p>
        {recording.normalizeGain != null && recording.normalizeGain > 1.05 && (
          <p className="record-meta">
            已將預覽音量峰值正規化（×{recording.normalizeGain.toFixed(1)}）；錄音仍關閉通話降噪／AGC。
          </p>
        )}
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
        {analyzing && (
          <p className="stub-banner stub-banner--ok" role="status">
            {analyzeLabel}（{Math.round(analyzePct * 100)}%）
          </p>
        )}
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
