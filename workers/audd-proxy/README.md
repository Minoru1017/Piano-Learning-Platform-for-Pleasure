# AudD proxy (Cloudflare Worker)

Holds `AUDD_API_TOKEN` and forwards short mic clips from the 跟彈 SPA to [AudD](https://audd.io/).

## One-time setup

1. Create an [AudD](https://dashboard.audd.io/) account and copy your API token.  
2. Install deps and log in to Cloudflare:

```bash
cd workers/audd-proxy
npm install
npx wrangler login
```

3. Put the token in a **Worker secret** (never commit it, never put it in Vite env):

```bash
npx wrangler secret put AUDD_API_TOKEN
```

4. Deploy:

```bash
npm run deploy
```

Note the worker URL, e.g. `https://audd-proxy.<your-subdomain>.workers.dev`.

## Frontend

Set at **build** time (Vite):

```bash
# local
VITE_AUDD_PROXY_URL=https://audd-proxy.<subdomain>.workers.dev npm run build:pages

# GitHub Actions: repo Settings → Variables → Actions
#   VITE_AUDD_PROXY_URL = https://audd-proxy.<subdomain>.workers.dev
```

Without `VITE_AUDD_PROXY_URL`, the SPA falls back to the stub + manual title edit.

## API

- `OPTIONS` / `GET` — health / CORS preflight  
- `POST` `multipart/form-data` field `file` — audio blob  

Allowed Origins: `https://minoru1017.github.io`, localhost Vite (`5173`/`4173`/`5174`).
