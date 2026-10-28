# Basic Pitch（已接入瀏覽器）

`@spotify/basic-pitch` + TFJS WASM 在前端跑推論。權重在 `public/basic-pitch/`，WASM 在 `public/tfjs-wasm/`。

## 流程

1. `analyzeRecording()` 優先呼叫 `basicPitchAnalyzer.ts`
2. 模型輸出 → `arrangeFromPitch.ts` 收成 Direction B：RH 單音量化、LH 僅強拍根音
3. 失敗則降級 `demoAnalyzer.ts`，並在 UI 標示「示範分析器」

## 準度限制（請對使用者誠實）

- 適合較乾淨、偏單一旋律的錄音；**密集混音／多樂器**仍會錯音、漏音、把伴奏當旋律
- LH 根音是從低音／小節內音高估計，不是商業級和弦辨識
- 節奏量化到 16 分音；原曲自由拍會對不齊

## 本機開發

模型已跟 repo 的 `public/` 一起走；`npm run build` 會複製進 `dist/`。首次推論需下載／載入約 1MB 權重＋WASM。
