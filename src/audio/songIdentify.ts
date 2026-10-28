/**
 * Song identification: AudD via Cloudflare Worker when configured,
 * otherwise stub + manual title (always editable in the UI).
 */
import { sliceBlobForIdentify } from './cleanCapture'
import { identifySongStub } from './songIdStub'

export type SongIdConfidence = 'audd' | 'audd-nomatch' | 'stub' | 'fallback'

export interface SongIdResult {
  suggestedTitle: string
  artist?: string | null
  confidence: SongIdConfidence
  note: string
  /** Raw useful fields from AudD when present. */
  raw?: unknown
}

interface AuddProxySuccess {
  ok: true
  matched: boolean
  title: string | null
  artist: string | null
  suggestedTitle: string | null
  result: unknown
  source: string
  message?: string
}

interface AuddProxyFailure {
  ok: false
  error?: string
  message?: string
}

function proxyBaseUrl(): string | null {
  const raw = import.meta.env.VITE_AUDD_PROXY_URL as string | undefined
  if (!raw || !String(raw).trim()) return null
  return String(raw).trim().replace(/\/$/, '')
}

async function identifyViaAuddProxy(
  baseUrl: string,
  audioBlob: Blob,
): Promise<SongIdResult> {
  const form = new FormData()
  const type = audioBlob.type || 'audio/webm'
  const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm'
  form.set('file', audioBlob, `clip.${ext}`)

  const res = await fetch(baseUrl, {
    method: 'POST',
    body: form,
  })

  let data: AuddProxySuccess | AuddProxyFailure
  try {
    data = (await res.json()) as AuddProxySuccess | AuddProxyFailure
  } catch {
    throw new Error(`AudD 代理回應不是 JSON（HTTP ${res.status}）`)
  }

  if (!res.ok || !data.ok) {
    const fail = data as AuddProxyFailure
    throw new Error(fail.message || fail.error || `AudD 代理錯誤（HTTP ${res.status}）`)
  }

  const ok = data as AuddProxySuccess
  if (!ok.matched || !ok.suggestedTitle) {
    return {
      suggestedTitle: '',
      artist: ok.artist,
      confidence: 'audd-nomatch',
      note: 'AudD 沒有對到曲目（較適合喇叭播放原曲）。請手動輸入或修改歌名後繼續。',
      raw: ok.result,
    }
  }

  return {
    suggestedTitle: ok.suggestedTitle,
    artist: ok.artist,
    confidence: 'audd',
    note: '已用 AudD 辨識（經 Cloudflare Worker）。歌名仍可手動修改。',
    raw: ok.result,
  }
}

/**
 * Prefer AudD proxy when `VITE_AUDD_PROXY_URL` is set; on any failure,
 * fall back to the local stub so the practice loop is never blocked.
 */
export async function identifySong(
  audioBlob: Blob,
  durationSec: number,
): Promise<SongIdResult> {
  const base = proxyBaseUrl()
  if (!base) {
    const stub = await identifySongStub(audioBlob, durationSec)
    return {
      ...stub,
      confidence: 'stub',
      note: '尚未設定 AudD 代理（VITE_AUDD_PROXY_URL）。目前為 stub 建議歌名，請手動確認或修改。',
    }
  }

  try {
    // Full songs can exceed AudD size limits — fingerprint a short music head slice.
    const clip = await sliceBlobForIdentify(audioBlob, 15)
    return await identifyViaAuddProxy(base, clip)
  } catch (e) {
    const stub = await identifySongStub(audioBlob, durationSec)
    const reason = e instanceof Error ? e.message : '未知錯誤'
    return {
      ...stub,
      confidence: 'fallback',
      note: `AudD 辨識失敗（${reason}）。已改用 stub 建議；請手動輸入或修改歌名。`,
    }
  }
}

export function isAuddConfigured(): boolean {
  return proxyBaseUrl() !== null
}
