/**
 * AudD music-ID proxy for the 跟彈 Pages SPA.
 * Holds AUDD_API_TOKEN as a Worker secret — never send the token to the browser.
 *
 * POST multipart/form-data with field `file` (audio blob)
 * → forwards to https://api.audd.io/
 * → JSON { ok, title, artist, suggestedTitle, result, source }
 */

const ALLOWED_ORIGINS = new Set([
  'https://minoru1017.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
])

const AUDD_ENDPOINT = 'https://api.audd.io/'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB safety cap (AudD allows ~10 MB)

function corsHeaders(origin) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : null
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (allow) headers['Access-Control-Allow-Origin'] = allow
  return headers
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  })
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      const headers = corsHeaders(origin)
      if (!headers['Access-Control-Allow-Origin']) {
        return new Response(null, { status: 403 })
      }
      return new Response(null, { status: 204, headers })
    }

    if (request.method === 'GET') {
      return json(
        {
          ok: true,
          service: 'audd-proxy',
          hint: 'POST multipart field "file" with a short audio clip (≈8–12s).',
        },
        200,
        origin,
      )
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, origin)
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403, origin)
    }

    if (!env.AUDD_API_TOKEN) {
      return json(
        {
          ok: false,
          error: 'missing_audd_token',
          message: 'Worker secret AUDD_API_TOKEN is not set.',
        },
        503,
        origin,
      )
    }

    let form
    try {
      form = await request.formData()
    } catch {
      return json({ ok: false, error: 'invalid_multipart' }, 400, origin)
    }

    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return json(
        { ok: false, error: 'missing_file', message: 'Expected multipart field "file".' },
        400,
        origin,
      )
    }

    if (file.size > MAX_BYTES) {
      return json(
        {
          ok: false,
          error: 'file_too_large',
          message: `Max upload is ${MAX_BYTES} bytes.`,
        },
        413,
        origin,
      )
    }

    const outbound = new FormData()
    outbound.set('api_token', env.AUDD_API_TOKEN)
    outbound.set('file', file, file.name || 'clip.webm')
    // Useful extras without requiring a paid enterprise plan for basics
    outbound.set('return', 'apple_music,spotify')

    let auddResponse
    try {
      auddResponse = await fetch(AUDD_ENDPOINT, {
        method: 'POST',
        body: outbound,
      })
    } catch (e) {
      return json(
        {
          ok: false,
          error: 'audd_unreachable',
          message: e instanceof Error ? e.message : 'AudD request failed',
        },
        502,
        origin,
      )
    }

    let payload
    try {
      payload = await auddResponse.json()
    } catch {
      return json({ ok: false, error: 'audd_bad_json' }, 502, origin)
    }

    if (payload?.status !== 'success') {
      return json(
        {
          ok: false,
          error: 'audd_error',
          message: payload?.error?.error_message || 'AudD returned an error',
          audd: payload,
        },
        502,
        origin,
      )
    }

    const result = payload.result
    if (!result) {
      return json(
        {
          ok: true,
          matched: false,
          title: null,
          artist: null,
          suggestedTitle: null,
          result: null,
          source: 'audd',
          message: 'No match in AudD catalog (try a clearer clip of the original recording).',
        },
        200,
        origin,
      )
    }

    const title = typeof result.title === 'string' ? result.title.trim() : ''
    const artist = typeof result.artist === 'string' ? result.artist.trim() : ''
    const suggestedTitle = [title, artist].filter(Boolean).join(' — ') || title || artist || null

    return json(
      {
        ok: true,
        matched: true,
        title: title || null,
        artist: artist || null,
        suggestedTitle,
        result: {
          title: result.title ?? null,
          artist: result.artist ?? null,
          album: result.album ?? null,
          release_date: result.release_date ?? null,
          song_link: result.song_link ?? null,
          apple_music: result.apple_music ?? null,
          spotify: result.spotify ?? null,
        },
        source: 'audd',
      },
      200,
      origin,
    )
  },
}
