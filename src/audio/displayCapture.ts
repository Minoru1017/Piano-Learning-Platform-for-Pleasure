/**
 * Chromium-friendly getDisplayMedia helpers for tab / system audio.
 *
 * Root cause of empty audioTracks (even on Chrome):
 * - User shared a Window / Entire Screen without system audio, or
 * - Shared a Chrome Tab but left「分享分頁音訊」unchecked.
 * Constraints cannot force the checkbox — we request audio loudly and
 * diagnose the chosen surface so the UI can offer a one-tap retry.
 */

export type DisplaySurfaceKind = 'browser' | 'window' | 'monitor' | 'unknown'

export type DisplayAudioFailReason =
  | 'unsupported'
  | 'cancelled'
  | 'no-audio-tab'
  | 'no-audio-window'
  | 'no-audio-monitor'
  | 'no-audio-unknown'

export class DisplayCaptureError extends Error {
  readonly reason: DisplayAudioFailReason
  readonly displaySurface: DisplaySurfaceKind

  constructor(reason: DisplayAudioFailReason, displaySurface: DisplaySurfaceKind = 'unknown') {
    super(messageForReason(reason))
    this.name = 'DisplayCaptureError'
    this.reason = reason
    this.displaySurface = displaySurface
  }
}

function messageForReason(reason: DisplayAudioFailReason): string {
  switch (reason) {
    case 'unsupported':
      return '此瀏覽器不支援螢幕／分頁音訊擷取（getDisplayMedia）。'
    case 'cancelled':
      return '已取消分享。若要擷取耳機裡的歌，請再試一次並勾選音訊。'
    case 'no-audio-tab':
      return '已分享分頁，但沒有音軌——通常是沒勾選「分享分頁音訊」。'
    case 'no-audio-window':
      return '分享「視窗」時 Chrome 常拿不到音訊。請改選「Chrome 分頁」並勾選音訊。'
    case 'no-audio-monitor':
      return '分享「整個螢幕」時未必有系統音。請改選「Chrome 分頁」並勾選「分享分頁音訊」。'
    default:
      return '沒有收到音軌。請用 Chrome／Edge 選「分頁」並勾選「分享分頁音訊」。'
  }
}

/** Extended options Chromium accepts beyond the TS lib DOM types. */
export type DisplayMediaRequest = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean
  selfBrowserSurface?: 'include' | 'exclude'
  systemAudio?: 'include' | 'exclude'
  surfaceSwitching?: 'include' | 'exclude'
  monitorTypeSurfaces?: 'include' | 'exclude'
  windowAudio?: 'exclude' | 'window' | 'system'
}

function musicDisplayAudioConstraints(): MediaTrackConstraints {
  return {
    // Keep music intact; call DSP smears songs.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    // Chrome: don't mute the shared tab for the listener (headphones OK).
    ...( { suppressLocalAudioPlayback: false } as MediaTrackConstraints ),
  }
}

/** Best-effort Chromium options: prefer tabs, request audio, allow system audio. */
export function buildDisplayMediaOptions(): DisplayMediaRequest {
  return {
    video: {
      // Hint: Chrome Tab pane first (still user-selectable).
      displaySurface: 'browser',
      frameRate: { ideal: 5, max: 15 },
      width: { ideal: 640 },
      height: { ideal: 360 },
    },
    audio: musicDisplayAudioConstraints(),
    // Do NOT preferCurrentTab — music is usually in another tab (YouTube etc.).
    preferCurrentTab: false,
    // Don't offer this silent app tab as the capture source.
    selfBrowserSurface: 'exclude',
    // Allow system audio when user picks Entire Screen (Windows Chrome).
    systemAudio: 'include',
    surfaceSwitching: 'include',
    monitorTypeSurfaces: 'include',
  }
}

/** Simpler fallback if the rich options object is rejected. */
export function buildDisplayMediaOptionsFallback(): DisplayMediaRequest {
  return {
    video: true,
    audio: true,
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
  }
}

export function readDisplaySurface(stream: MediaStream): DisplaySurfaceKind {
  const video = stream.getVideoTracks()[0]
  if (!video) return 'unknown'
  try {
    const settings = video.getSettings() as MediaTrackSettings & {
      displaySurface?: string
    }
    const s = settings.displaySurface
    if (s === 'browser' || s === 'window' || s === 'monitor') return s
  } catch {
    /* ignore */
  }
  return 'unknown'
}

export function failReasonForNoAudio(surface: DisplaySurfaceKind): DisplayAudioFailReason {
  if (surface === 'browser') return 'no-audio-tab'
  if (surface === 'window') return 'no-audio-window'
  if (surface === 'monitor') return 'no-audio-monitor'
  return 'no-audio-unknown'
}

/**
 * Request a display stream that includes audio when the user opts in.
 * Retries with simpler constraints if the first call throws TypeError.
 */
export async function requestDisplayStream(): Promise<{
  stream: MediaStream
  displaySurface: DisplaySurfaceKind
}> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new DisplayCaptureError('unsupported')
  }

  const attempts: DisplayMediaRequest[] = [
    buildDisplayMediaOptions(),
    buildDisplayMediaOptionsFallback(),
    { video: true, audio: true },
  ]

  let lastErr: unknown
  for (const opts of attempts) {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(
        opts as DisplayMediaStreamOptions,
      )
      return { stream, displaySurface: readDisplaySurface(stream) }
    } catch (e) {
      lastErr = e
      // User dismiss / permission deny — don't retry quieter options.
      if (e instanceof DOMException) {
        if (e.name === 'NotAllowedError' || e.name === 'AbortError') {
          throw new DisplayCaptureError('cancelled')
        }
      }
      // TypeError from unsupported constraint fields → try next attempt.
      if (!(e instanceof TypeError)) {
        const msg = e instanceof Error ? e.message : '無法開始分享'
        throw new Error(`無法開始螢幕／分頁音訊：${msg}`)
      }
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : '無法開始分享'
  throw new Error(`無法開始螢幕／分頁音訊：${msg}`)
}

/** zh-Hant checklist shown when audio is missing (retry UX). */
export const DISPLAY_AUDIO_CHECKLIST_ZH = [
  '用 Chrome 或 Edge（不要用 Safari）',
  '對話框選上方「Chrome 分頁／分頁」，不要選「視窗」或「整個螢幕」',
  '選正在播歌的那個分頁（例如 YouTube）',
  '勾選底部「分享分頁音訊／Share tab audio」',
  '再按「分享／Share」',
] as const
