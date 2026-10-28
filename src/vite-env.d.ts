/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Worker URL for AudD proxy (no trailing slash). */
  readonly VITE_AUDD_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
