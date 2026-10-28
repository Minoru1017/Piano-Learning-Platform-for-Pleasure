/**
 * Peak-normalize a recorded clip for preview + AudD upload.
 *
 * Music capture keeps AGC off (cleaner for fingerprinting). Laptop mics then
 * often record very quiet; without makeup, HTMLAudioElement playback sounds
 * "超小聲". We boost to a target peak with a capped gain so silence doesn't
 * explode into noise.
 */

const TARGET_PEAK = 0.9
/** ~18 dB — enough for typical quiet laptop mics without runaway hiss. */
const MAX_GAIN = 8
const MIN_PEAK = 1e-4

export interface NormalizeResult {
  blob: Blob
  /** Linear makeup applied (1 = unchanged). */
  gain: number
  peakBefore: number
}

export async function peakNormalizeBlob(blob: Blob): Promise<NormalizeResult> {
  let audio: AudioBuffer
  const ctx = new AudioContext()
  try {
    const bytes = await blob.arrayBuffer()
    audio = await ctx.decodeAudioData(bytes.slice(0))
  } catch {
    await ctx.close().catch(() => undefined)
    return { blob, gain: 1, peakBefore: 0 }
  }
  await ctx.close().catch(() => undefined)

  let peak = 0
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const data = audio.getChannelData(c)
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]!)
      if (a > peak) peak = a
    }
  }

  if (peak < MIN_PEAK) {
    return { blob, gain: 1, peakBefore: peak }
  }

  const rawGain = TARGET_PEAK / peak
  const gain = Math.min(MAX_GAIN, Math.max(1, rawGain))
  if (gain <= 1.05) {
    // Already loud enough — keep original container (webm/opus).
    return { blob, gain: 1, peakBefore: peak }
  }

  const channels = audio.numberOfChannels
  const length = audio.length
  const sampleRate = audio.sampleRate
  const mixed: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    const src = audio.getChannelData(c)
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      out[i] = Math.max(-1, Math.min(1, src[i]! * gain))
    }
    mixed.push(out)
  }

  const wav = encodeWav(mixed, sampleRate)
  return {
    blob: new Blob([wav], { type: 'audio/wav' }),
    gain,
    peakBefore: peak,
  }
}

function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = channels.length
  const numFrames = channels[0]?.length ?? 0
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const dataSize = numFrames * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = channels[c]![i]!
      const s = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return buffer
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}
