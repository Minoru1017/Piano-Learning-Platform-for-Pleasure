/** MIDI note number (A0=21 … C8=108). */
export type Midi = number

export type Hand = 'rh' | 'lh'

/**
 * Stem → piano layer role after characterization.
 * Default playable mix: vocal|melody (RH) + bass (LH).
 * Ornament off by default; harmony sparse / optional.
 */
export type NoteRole = 'bass' | 'vocal' | 'melody' | 'harmony' | 'ornament'

export interface NoteEvent {
  midi: Midi
  /** Beat position from piece start (quarter-note units at 4/4). */
  startBeat: number
  durationBeats: number
  hand: Hand
  /** Which characterized stem this note came from. */
  role: NoteRole
}

/** Best-effort per-stem presence (0..1) — not Demucs isolation. */
export interface StemPresence {
  presence: number
  /** Short EQ / placement hint for UI honesty. */
  eqHint: string
}

export interface StemCharacterization {
  bass: StemPresence
  vocal: StemPresence & { usedForRh: boolean }
  melody: StemPresence & { usedForRh: boolean }
  harmony: StemPresence
  ornament: StemPresence
  /** How stems were derived (honesty label). */
  method: 'band-stereo-transient'
}

export type BpmSource = 'audio-autocorr' | 'onset-median' | 'demo'

export interface Arrangement {
  title: string
  bpm: number
  bpmSource?: BpmSource
  /** Beats per measure (v1 assumes 4/4). */
  beatsPerMeasure: 4
  measureCount: number
  notes: NoteEvent[]
  /** Source of pitch extraction for UI honesty. */
  analyzer: 'demo' | 'basic-pitch'
  /** Traditional Chinese note shown in practice UI (honest labeling). */
  analyzerNote?: string
  /** Seconds of source recording used (after silence trim; t=0 ≈ music start). */
  sourceDurationSec: number
  /** Seconds trimmed before musical onset in the raw capture (0 if already aligned). */
  musicStartOffsetSec?: number
  /** Best-effort stem characterization metadata (v1.5). */
  stems?: StemCharacterization
}

export interface LoopRange {
  /** Inclusive 0-based measure index. */
  startMeasure: number
  /** Number of measures in the loop (N). */
  measureCount: number
}

export type AppPhase = 'record' | 'identify' | 'practice'

/** Default layer mute: ornament off so beginners aren’t overwhelmed. */
export const DEFAULT_LAYER_MUTE: Record<NoteRole, boolean> = {
  bass: false,
  vocal: false,
  melody: false,
  harmony: false,
  ornament: true,
}

export const ROLE_LABEL_ZH: Record<NoteRole, string> = {
  bass: 'BASS',
  vocal: '人聲',
  melody: '主旋律',
  harmony: '和聲',
  ornament: '點綴',
}
