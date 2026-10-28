# Swapping in Basic Pitch

`demoAnalyzer.ts` is a labeled demo path so the UX loop works offline without model weights.

## Target interface

Return `Arrangement` from `src/types/music.ts`:

- `notes[]` with `hand: 'rh' | 'lh'`
- RH: at most one pitch at any time; roughly C3–C6; quantized
- LH: **roots only** on strong beats (1–2 hits per measure); no root+fifth in v1
- `beatsPerMeasure: 4`, sensible `bpm`, `measureCount`

## Suggested steps

1. Decode the same `Blob` from the mic recording (`AudioBuffer`).
2. Run Basic Pitch (WASM/ONNX in-browser, or a small local/server inference).
3. Post-process:
   - Melody line → RH monophonic
   - Chord / bass estimate → keep only downbeat (and optional beat 3) root
4. Map into measure grid; expose loop selection in the practice UI (already built).
5. Set `analyzer: 'basic-pitch'`.

Keep `analyzeRecordingDemo` as fallback when the model fails to load.
