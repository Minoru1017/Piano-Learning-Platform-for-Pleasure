/** MIDI note number (A0=21 … C8=108). */
export type Midi = number

export type Hand = 'rh' | 'lh'

export interface NoteEvent {
  midi: Midi
  /** Beat position from piece start (quarter-note units at 4/4). */
  startBeat: number
  durationBeats: number
  hand: Hand
}

export interface Arrangement {
  title: string
  bpm: number
  /** Beats per measure (v1 assumes 4/4). */
  beatsPerMeasure: 4
  measureCount: number
  notes: NoteEvent[]
  /** Source of pitch extraction for UI honesty. */
  analyzer: 'demo' | 'basic-pitch'
  /** Seconds of source recording used. */
  sourceDurationSec: number
}

export interface LoopRange {
  /** Inclusive 0-based measure index. */
  startMeasure: number
  /** Number of measures in the loop (N). */
  measureCount: number
}

export type AppPhase = 'record' | 'identify' | 'practice'
