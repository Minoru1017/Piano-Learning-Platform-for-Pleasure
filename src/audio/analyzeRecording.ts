import type { Arrangement } from '../types/music'
import { analyzeRecordingBasicPitch } from './basicPitchAnalyzer'
import { analyzeRecordingDemo } from './demoAnalyzer'

export type AnalyzeProgress = (percent: number, label: string) => void

/**
 * Prefer Basic Pitch; fall back to the labeled demo analyzer so the UX
 * loop never blocks. Callers must surface `arrangement.analyzer` / note in UI.
 */
export async function analyzeRecording(
  blob: Blob,
  title: string,
  durationSec: number,
  onProgress?: AnalyzeProgress,
): Promise<Arrangement> {
  try {
    return await analyzeRecordingBasicPitch(blob, title, durationSec, onProgress)
  } catch (e) {
    const reason = e instanceof Error ? e.message : '未知錯誤'
    onProgress?.(0.5, `Basic Pitch 失敗，改用示範分析器…（${reason}）`)
    const demo = await analyzeRecordingDemo(blob, title, durationSec)
    return {
      ...demo,
      analyzerNote: `Basic Pitch 無法使用（${reason}）。目前為示範分析器：不會忠實跟錄音音高，請當跟彈流程測試。`,
    }
  }
}
