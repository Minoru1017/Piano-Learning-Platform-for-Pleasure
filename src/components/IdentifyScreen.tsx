import { useEffect, useState } from 'react'
import type { RecordingResult } from '../audio/recorder'
import { identifySongStub } from '../audio/songIdStub'
import { analyzeRecordingDemo } from '../audio/demoAnalyzer'
import type { Arrangement } from '../types/music'

interface IdentifyScreenProps {
  recording: RecordingResult
  onReady: (arrangement: Arrangement) => void
  onBack: () => void
}

export function IdentifyScreen({ recording, onReady, onBack }: IdentifyScreenProps) {
  const [title, setTitle] = useState('')
  const [stubNote, setStubNote] = useState('正在 stub 辨識歌名…')
  const [identifying, setIdentifying] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await identifySongStub(recording.blob, recording.durationSec)
        if (cancelled) return
        setTitle(result.suggestedTitle)
        setStubNote(result.note)
      } catch (e) {
        if (!cancelled) {
          setTitle('尚未命名')
          setStubNote('辨識 stub 失敗，請手動輸入歌名。')
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

  return (
    <section className="screen screen--identify">
      <div className="brand-block brand-block--compact">
        <p className="brand">跟彈</p>
        <h1 className="headline">這是哪一首？</h1>
        <p className="lede">
          歌名可手動修改。確認後會用<strong>同一段錄音</strong>抽出 RH 旋律＋LH 根音（demo
          分析器）。
        </p>
      </div>

      <div className="identify-panel">
        <audio className="playback-audio" src={recording.objectUrl} controls />
        <label className="field">
          <span className="field__label">歌名</span>
          <input
            className="field__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={identifying || analyzing}
            placeholder={identifying ? '辨識中…' : '輸入或修改歌名'}
            autoFocus
          />
        </label>
        <p className="stub-banner" role="status">
          {stubNote}
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
