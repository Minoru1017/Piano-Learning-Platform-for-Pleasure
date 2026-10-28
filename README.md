# 跟彈 — 極簡雙手鋼琴跟彈（MVP 網頁原型）

興趣學琴用的跟彈原型：**麥克風或螢幕／分頁音訊錄音 → 辨歌名 → 從同一段（清潔後）錄音抽出右手旋律＋左手根音 → 以小節循環跟彈**。  
對錯偵測、帳號、串流抓完整曲、可出版 PDF **都不在 v1**。

產品規格見專案文件（Agent Store）：`docs/mvp-spec.md`。

## 線上預覽（GitHub Pages）

**https://minoru1017.github.io/Piano-Learning-Platform-for-Pleasure/**

### 為什麼曾出現空白頁？

Pages 曾設成 **Deploy from branch → `main` → `/`**，直接端出 **Vite 原始** `index.html`（`<script src="/src/main.tsx">`）。瀏覽器無法執行 `.tsx` → `#root` 空白。

### 現在怎麼修

- Vite 專案入口改在 `src/`；`npm run build:pages` 會把 **production `dist/`** 同步到 repo 根目錄的 `index.html` + `assets/`（給 legacy Pages 用）。
- 根目錄那些檔是**建置產物**；改 UI 請編 `src/`，再跑 `npm run build:pages`。
- Actions `pages.yml`：建置 → 驗證 HTML 不含 `/src/main.tsx` → 同步根目錄 → 若 Settings 已選 **GitHub Actions** 再 `deploy-pages`。

可選（建議）：**Settings → Pages → Source → GitHub Actions**（一次即可）。即使維持 branch `main` `/`，根目錄 production 檔也應可開站。

本 app 無 client router，不需 `404.html`／hash router。

## 怎麼跑（本機）

```bash
npm install
npm run dev
```

瀏覽器打開終端機顯示的本機網址（預設 `http://localhost:5173`）。  
需允許**麥克風權限**才能走完整流程。

```bash
npm run build        # 型別檢查 + 正式建置到 dist/（含 Pages base path）
npm run build:pages  # build + 同步 dist → 根目錄（供 GitHub Pages）
npm run preview      # 預覽 dist/
```

## 核心迴圈（UI）

1. **錄音** — 麥克風或螢幕／分頁音訊；可錄完整曲（上限 12 分）；自動裁靜音／底噪，小節 1＝音樂起點  
2. **辨歌名** — 顯示建議歌名（可手動改；AudD 用開頭短片段）   
3. **抽出** — 用**同一段錄音**產出 RH 單音旋律＋LH 強拍根音  
4. **跟彈** — 大虛擬鍵盤高亮；選 N 小節循環、放慢、RH/LH 靜音；譜面可關  
5. **習慣** — 可選「今天練完這段了嗎？」

## 歌曲辨識（AudD ＋ Cloudflare Worker）

GitHub Pages **不能**把 AudD token 放進前端。流程：

`瀏覽器錄音 → POST 音訊到你的 Worker → Worker 用 secret 呼叫 AudD → 回傳歌名`  
歌名欄位**永遠可手動改**；沒設代理／失敗時降級 stub＋手輸，不擋跟彈。

### 你需要手動做的事（一次性）

1. 到 [AudD Dashboard](https://dashboard.audd.io/) 註冊，複製 API token（試用約 300 次／14 天，見 [定價](https://audd.io/pricing/)）。  
2. 部署 Worker（token 只進 Cloudflare secret，**不要 commit**）：

```bash
cd workers/audd-proxy
npm install
npx wrangler login
npx wrangler secret put AUDD_API_TOKEN   # 貼上 AudD token
npm run deploy
```

記下 Worker URL，例如 `https://audd-proxy.<subdomain>.workers.dev`。細節見 `workers/audd-proxy/README.md`。

3. 建置前端時帶入代理網址（**build-time** Vite 變數，不是 secret）：

```bash
# 本機
VITE_AUDD_PROXY_URL=https://audd-proxy.<subdomain>.workers.dev npm run build:pages

# GitHub Pages CI：repo Settings → Secrets and variables → Actions → Variables
#   Name:  VITE_AUDD_PROXY_URL
#   Value: https://audd-proxy.<subdomain>.workers.dev
# 然後 push main（或 workflow_dispatch）重建 Pages。
```

### 沒有 token／代理時

- 不設 `VITE_AUDD_PROXY_URL` → stub 建議歌名＋手動編輯（完全可用）。  
- 有設但 Worker／AudD 失敗 → UI 說明失敗原因，改 stub／手輸，仍可進練習。

## 什麼是真的、什麼是 stub

| 能力 | 狀態 |
| --- | --- |
| 麥克風／螢幕分頁音訊 | **真實**（關通話 DSP；清潔 onset＋閘；峰值正規化；上限 12 分）。Chrome／Edge：選**播歌分頁**並勾選「分享分頁音訊」；無音軌時有檢查清單＋重試 |
| 歌曲指紋／辨歌 | **AudD 經 Worker**（需你部署＋設 `VITE_AUDD_PROXY_URL`）；否則 **stub**；**歌名永遠可手動改** |
| 音高 → 分層鋼琴 | **BPM**（自相關）＋ **Basic Pitch**；分層特徵 BASS／人聲／主旋律／和聲／點綴（非 Demucs）；預設 RH＝人聲或主旋律、LH＝BASS；點綴預設關；失敗 → **示範分析器** |
| 虛擬鍵盤跟彈、循環、放慢、RH/LH、層開關、習慣勾選 | **真實 UI／邏輯** |
| 預覽音色 | 簡易 Web Audio 合成（非真實鋼琴採樣） |
| 對錯偵測 | **不做（v1）** |
| 串流抓完整曲／PDF | **不做（v1）** |

相關檔案：

- `workers/audd-proxy/` — Cloudflare Worker  
- `src/audio/songIdentify.ts` — 前端辨識（AudD → stub 降級）  
- `src/audio/analyzeRecording.ts` / `basicPitchAnalyzer.ts` / `arrangeFromPitch.ts` — 轉譜  
- `src/audio/bpm.ts` / `stemCharacterize.ts` / `vocalPrefer.ts` — BPM＋分層特徵  
- `src/audio/recorder.ts` / `cleanCapture.ts` — 麥克風／分頁音訊＋onset 清潔  
- `src/audio/demoAnalyzer.ts` — 降級示範分析器  
- `public/basic-pitch/` · `public/tfjs-wasm/` — 模型與 WASM  

**準度提醒：** 分層是瀏覽器內 best-effort（頻段／中置／暫態），不是專業分軌；密集混音、遠距喇叭仍容易跟原曲有出入。MVP 優先「能跟彈的極簡雙手」，不是出版級轉譜。

## 技術

- Vite + React 19 + TypeScript  
- 可選：Cloudflare Worker（AudD 代理）；無 Worker 時前端仍可完整跑 stub／手輸  

## CI／Deploy

- **GitHub Pages：** `.github/workflows/pages.yml` — push `main` 建置 `dist/`（可讀 `vars.VITE_AUDD_PROXY_URL`）、驗證、同步根目錄 publish 檔；並嘗試 `actions/deploy-pages`。  
- **AWS ECS：** `.github/workflows/aws.yml` 仍為 **僅 `workflow_dispatch`**；勿把 `MY_*` 佔位值加回 push 觸發。  

## 授權注意

本原型只處理**使用者自己的麥克風錄音**，不會去抓串流完整曲。商用辨歌 API 與曲庫授權需另評估。
