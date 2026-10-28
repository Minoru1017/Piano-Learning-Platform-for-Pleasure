import type { Midi } from '../types/music'

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

export function midiToName(midi: Midi): string {
  const name = NAMES_SHARP[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}

export function midiToFreq(midi: Midi): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

export function isBlackKey(midi: Midi): boolean {
  const pc = ((midi % 12) + 12) % 12
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
}

/** White-key index from C0 upward (for layout). */
export function whiteKeyIndex(midi: Midi): number {
  const octave = Math.floor(midi / 12) - 1
  const pc = ((midi % 12) + 12) % 12
  const whiteInOctave = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc]
  return octave * 7 + whiteInOctave
}

export function clampMidi(midi: number, lo: Midi, hi: Midi): Midi {
  return Math.max(lo, Math.min(hi, Math.round(midi)))
}
