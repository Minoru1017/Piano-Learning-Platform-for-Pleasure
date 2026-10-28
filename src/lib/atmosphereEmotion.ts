import type { NoteEvent, NoteRole } from '../types/music'

/** Soft environment emotion driven by active follow notes. */
export interface AtmosphereEmotion {
  /** 0–360 hue for prismatic wash */
  hue: number
  /** 0–1 overall energy / brightness lift */
  intensity: number
  /** 0–1 prism / refraction strength */
  prism: number
  /** 0–1 radial / grid breathe amplitude */
  breathe: number
  /** Dominant role tint (optional) */
  role: NoteRole | 'idle'
}

export const IDLE_ATMOSPHERE: AtmosphereEmotion = {
  hue: 210,
  intensity: 0.08,
  prism: 0.12,
  breathe: 0.15,
  role: 'idle',
}

const ROLE_HUE: Record<NoteRole, number> = {
  bass: 220,
  vocal: 340,
  melody: 195,
  harmony: 265,
  ornament: 48,
}

/**
 * Map currently sounding notes → soft crystal atmosphere.
 * Higher MIDI → cooler / clearer; bass → deeper cool; ornaments → warm sparkle.
 */
export function emotionFromNotes(notes: NoteEvent[]): AtmosphereEmotion {
  if (!notes.length) return IDLE_ATMOSPHERE

  let midiSum = 0
  let weight = 0
  const roleWeight: Partial<Record<NoteRole, number>> = {}

  for (const n of notes) {
    const w = Math.max(0.2, n.durationBeats)
    midiSum += n.midi * w
    weight += w
    roleWeight[n.role] = (roleWeight[n.role] ?? 0) + w
  }

  const avgMidi = midiSum / weight
  // Map ~36–84 → warm depth to cool crystal
  const pitchHue = 30 + ((avgMidi - 36) / 48) * 200
  let dominant: NoteRole = 'melody'
  let best = 0
  for (const [role, w] of Object.entries(roleWeight) as [NoteRole, number][]) {
    if (w > best) {
      best = w
      dominant = role
    }
  }
  const hue = pitchHue * 0.55 + ROLE_HUE[dominant] * 0.45
  const intensity = Math.min(1, 0.18 + notes.length * 0.12 + (avgMidi - 48) * 0.004)
  const prism = Math.min(1, 0.2 + notes.length * 0.1 + (dominant === 'ornament' ? 0.25 : 0))
  const breathe = Math.min(1, 0.25 + notes.length * 0.14)

  return {
    hue: ((hue % 360) + 360) % 360,
    intensity,
    prism,
    breathe,
    role: dominant,
  }
}
