# Basic Pitch（已接入瀏覽器）

`@spotify/basic-pitch` + TFJS WASM 在前端跑推論。權重在 `public/basic-pitch/`，WASM 在 `public/tfjs-wasm/`。

## 流程（v1.5 分層）

1. `analyzeRecording()` 優先呼叫 `basicPitchAnalyzer.ts`
2. `bpm.ts`：能量包絡自相關 → BPM（驅動小節格線／循環）
3. `stemCharacterize.ts`：頻段／中置／暫態啟發式 → BASS・人聲・主旋律・和聲・點綴 presence（**非 Demucs**）
4. `vocalPrefer.ts`：有人聲 → RH 中置＋中頻 stem；否則全混音主旋律
5. **重採樣為 mono @ 22050 Hz**（`resample.ts`）
6. 模型輸出 → `arrangeFromPitch.ts` 映射為可跟彈層：`{bass, vocal|melody, harmony, ornament}`；混音特徵只當進譜閘
7. 失敗則降級 `demoAnalyzer.ts`，並在 UI 標示「示範分析器」

Regression: `npm run test:resample`

## 準度限制（請對使用者誠實）

- 適合較乾淨、偏單一旋律的錄音；**密集混音／多樂器**仍會錯音、漏音、把伴奏當旋律
- 分層是 best-effort 特徵化，不是專業分軌／出版譜
- LH 根音是從低音／小節內音高估計，不是商業級和弦辨識
- BPM 可能落在半速／倍速；rubato 與高度壓縮流行曲較不穩
- 節奏量化到 16 分音；原曲自由拍會對不齊

## 本機開發

模型已跟 repo 的 `public/` 一起走；`npm run build` 會複製進 `dist/`。首次推論需下載／載入約 1MB 權重＋WASM。
