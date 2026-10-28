/**
 * Stub song recognizer.
 *
 * TODO: Swap in a real fingerprint / music-ID API (e.g. ACRCloud, AudD, ShazamKit)
 * when API keys are available. Keep the same interface so the UX loop stays intact.
 */

export interface SongIdResult {
  /** Suggested title; user can edit. */
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
): Promise<SongIdResult> {
  // Simulate network latency of a real ID API without blocking forever.
  await new Promise((r) => setTimeout(r, 600 + Math.min(800, durationSec * 40)))
  const idx = Math.floor(Math.random() * DEMO_TITLES.length)
  return {
    suggestedTitle: DEMO_TITLES[idx]!,
    confidence: 'stub',
    note: '目前為 stub 辨識（無 API key）。請確認或手動修改歌名。',
  }
}
