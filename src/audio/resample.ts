/** Basic Pitch hard-requires this rate (see @spotify/basic-pitch AUDIO_SAMPLE_RATE). */
export const BASIC_PITCH_SAMPLE_RATE = 22_050

/** Downmix AudioBuffer channels to a single Float32Array (average). */
export function mixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer
  if (numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0))
  }
  const out = new Float32Array(length)
  for (let c = 0; c < numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      out[i]! += ch[i]!
    }
  }
  const inv = 1 / numberOfChannels
  for (let i = 0; i < length; i++) {
    out[i]! *= inv
  }
  return out
}

/**
 * Linear resample. Used so 44100/48000 mic captures match Basic Pitch's 22050 Hz.
 * Keep algorithm in sync with `scripts/check-resample.mjs`.
 */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate <= 0 || toRate <= 0) {
    throw new Error(`Invalid sample rates: ${fromRate} → ${toRate}`)
  }
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
    out[i] = input[i0]! * (1 - t) + input[i1]! * t
  }
  return out
}

/**
 * Return a mono AudioBuffer at 22050 Hz for BasicPitch.evaluateModel.
 * Mic capture is often 44100 or 48000 — without this, BP throws.
 */
export function toBasicPitchAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const mono = mixToMono(buffer)
  const samples = resampleLinear(mono, buffer.sampleRate, BASIC_PITCH_SAMPLE_RATE)

  // createBuffer allows an explicit sampleRate independent of the context's rate.
  const ctx = new OfflineAudioContext(1, Math.max(1, samples.length), BASIC_PITCH_SAMPLE_RATE)
  const out = ctx.createBuffer(1, Math.max(1, samples.length), BASIC_PITCH_SAMPLE_RATE)
  out.copyToChannel(samples, 0)
  return out
}
