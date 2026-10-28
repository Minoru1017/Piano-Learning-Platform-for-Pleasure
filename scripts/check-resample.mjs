/**
 * Regression check: 44100 Hz mic buffers must resample to Basic Pitch's 22050 Hz.
 * Mirrors `src/audio/resample.ts` (keep algorithms in sync).
 */
const BASIC_PITCH_SAMPLE_RATE = 22_050

function resampleLinear(input, fromRate, toRate) {
  if (input.length === 0) return new Float32Array(0)
  if (fromRate === toRate) return new Float32Array(input)
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate))
  const out = new Float32Array(outLen)
  const ratio = fromRate / toRate
  const last = input.length - 1
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio
    const i0 = Math.min(Math.floor(srcPos), last)
    const i1 = Math.min(i0 + 1, last)
    const t = srcPos - Math.floor(srcPos)
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg)
    process.exit(1)
  }
}

// 1 second at 44100 → ~22050 samples
const from44100 = new Float32Array(44100)
for (let i = 0; i < from44100.length; i++) {
  from44100[i] = Math.sin((2 * Math.PI * 440 * i) / 44100)
}
const to22050 = resampleLinear(from44100, 44100, BASIC_PITCH_SAMPLE_RATE)
assert(to22050.length === 22050, `44100→22050 length expected 22050, got ${to22050.length}`)

// 48000 path (common Chrome getUserMedia)
const from48000 = new Float32Array(48000)
const toFrom48 = resampleLinear(from48000, 48000, BASIC_PITCH_SAMPLE_RATE)
assert(toFrom48.length === 22050, `48000→22050 length expected 22050, got ${toFrom48.length}`)

// Already 22050 stays same length
const same = resampleLinear(new Float32Array(22050), 22050, 22050)
assert(same.length === 22050, 'identity resample length')

console.log('OK: resample 44100/48000 → 22050 (Basic Pitch)')
