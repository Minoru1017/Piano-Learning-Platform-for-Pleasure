/**
 * Local stub song recognizer (no API).
 * Used when AudD proxy is unset or fails — UI always allows manual title edit.
 */

export interface StubSongIdResult {
  suggestedTitle: string
  confidence: 'stub'
  note: string
}

const DEMO_TITLES = [
  '練習曲・黃昏',
  '街角口哨',
  '雨後散步',
  '還沒想好歌名',
  '副歌那段',
]

export async function identifySongStub(
  _audioBlob: Blob,
  durationSec: number,
): Promise<StubSongIdResult> {
  await new Promise((r) => setTimeout(r, 400 + Math.min(600, durationSec * 30)))
  const idx = Math.floor(Math.random() * DEMO_TITLES.length)
  return {
    suggestedTitle: DEMO_TITLES[idx]!,
    confidence: 'stub',
    note: '目前為 stub 辨識（無 AudD 代理）。請確認或手動修改歌名。',
  }
}
