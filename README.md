# 跟彈 — 極簡雙手鋼琴跟彈（MVP 網頁原型）

興趣學琴用的跟彈原型：**麥克風錄音 → 辨歌名 → 從同一段錄音抽出右手旋律＋左手根音 → 以小節循環跟彈**。  
對錯偵測、帳號、串流抓完整曲、可出版 PDF **都不在 v1**。

產品規格見專案文件（Agent Store）：`docs/mvp-spec.md`。

## 線上預覽（GitHub Pages）

預期網址：

**https://minoru1017.github.io/Piano-Learning-Platform-for-Pleasure/**

（repo：`Minoru1017/Piano-Learning-Platform-for-Pleasure`；Vite `base` 已設為 `/Piano-Learning-Platform-for-Pleasure/`。）

合併到 `main` 後，Actions 工作流程 **Deploy GitHub Pages** 會建置並部署。  
**第一次**請到 repo **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**（若尚未選）。之後 push `main` 會自動更新站點。

本 app 無 client router（單頁狀態切換），不需 `404.html`／hash router。

## 怎麼跑（本機）

```bash
npm install
npm run dev
```

瀏覽器打開終端機顯示的本機網址（預設 `http://localhost:5173`）。  
需允許**麥克風權限**才能走完整流程。

```bash
npm run build    # 型別檢查 + 正式建置（含 Pages base path）
npm run preview  # 預覽建置結果
```

## 核心迴圈（UI）

1. **錄音** — 錄 10–30 秒正在聽／哼的片段  
2. **辨歌名** — 顯示建議歌名（可手動改）  
3. **抽出** — 用**同一段錄音**產出 RH 單音旋律＋LH 強拍根音  
4. **跟彈** — 大虛擬鍵盤高亮；選 N 小節循環、放慢、RH/LH 靜音；譜面可關  
5. **習慣** — 可選「今天練完這段了嗎？」

## 什麼是真的、什麼是 stub

| 能力 | 狀態 |
| --- | --- |
| 麥克風錄音（MediaRecorder） | **真實** |
| 歌曲指紋／辨歌 API | **Stub** — 隨機建議歌名＋可編輯；清楚標註待接 ACRCloud / AudD / Shazam 等 |
| 音高 → RH/LH 編曲 | **Demo 分析器** — Web Audio 粗估 BPM／音高種子後，量化產出符合方向 B 的可練編曲（非 Basic Pitch） |
| 虛擬鍵盤跟彈、循環、放慢、RH/LH、習慣勾選 | **真實 UI／邏輯** |
| 預覽音色 | 簡易 Web Audio 合成（非真實鋼琴採樣） |
| 對錯偵測 | **不做（v1）** |
| 串流抓完整曲／PDF | **不做（v1）** |

Stub 入口：

- `src/audio/songIdStub.ts` — 歌名辨識  
- `src/audio/demoAnalyzer.ts` — 旋律／根音抽出  

## 換成 Basic Pitch（路徑）

1. 加入 Basic Pitch WASM／ONNX（或伺服端推論）依賴。  
2. 在 `demoAnalyzer.ts` 同層新增例如 `basicPitchAnalyzer.ts`，輸入 `Blob`／`AudioBuffer`，輸出相同的 `Arrangement`（`src/types/music.ts`）。  
3. 規則後處理：RH 同時間最多 1 音；LH **僅**強拍根音（每小節 1–2）；量化到拍點。  
4. 在 `IdentifyScreen` 改呼叫新分析器，並把 `arrangement.analyzer` 設為 `'basic-pitch'`。  
5. 無 API／模型時保留 demo 降級，勿擋住跟彈迴圈。

## 技術

- Vite + React 19 + TypeScript  
- 純前端；無後端、無帳號  

## CI／Deploy

- **GitHub Pages：** `.github/workflows/pages.yml` — push `main`（或手動 `workflow_dispatch`）建置並部署。  
- **AWS ECS：** `.github/workflows/aws.yml` 仍為 **僅 `workflow_dispatch`**；MVP 不需要，也不會在 push／PR 自動跑。勿把 `MY_*` 佔位值加回 push 觸發。  
- 日後若要 ECS：先備妥 Dockerfile、task definition，再於 repo Variables／Secrets 填入設定（見該 workflow 註解）。

## 授權注意

本原型只處理**使用者自己的麥克風錄音**，不會去抓串流完整曲。商用辨歌 API 與曲庫授權需另評估。
