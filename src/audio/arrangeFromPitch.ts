import type {
  Arrangement,
  BpmSource,
  NoteEvent,
  NoteRole,
  StemCharacterization,
} from '../types/music'
import { clampMidi } from '../lib/notes'
import { gateNotesForRole } from './stemCharacterize'

export interface RawPitchNote {
  startTimeSeconds: number
  durationSeconds: number
  pitchMidi: number
  amplitude: number
}

const RH_LO = 48 // C3
const RH_HI = 84 // C6
const LH_LO = 36
const LH_HI = 55

function estimateBpmFromOnsets(notes: RawPitchNote[], durationSec: number): number {
  const starts = [...notes.map((n) => n.startTimeSeconds)].sort((a, b) => a - b)
  if (starts.length < 4) {
    return durationSec > 0 ? Math.round(Math.min(140, Math.max(70, (8 * 60) / durationSec))) : 96
  }
  const gaps: number[] = []
  for (let i = 1; i < starts.length; i++) {
    const g = starts[i]! - starts[i - 1]!
    if (g > 0.12 && g < 1.2) gaps.push(g)
  }
  if (!gaps.length) return 96
  gaps.sort((a, b) => a - b)
  const mid = gaps[Math.floor(gaps.length / 2)]!
  let bpm = 60 / mid
  while (bpm < 70) bpm *= 2
  while (bpm > 140) bpm /= 2
  return Math.round(bpm)
}

function quantizeBeat(beat: number, grid = 0.25): number {
  return Math.round(beat / grid) * grid
}

/** Prefer the strongest overlapping note in a time window (melody line). */
function monophonicMelody(notes: RawPitchNote[]): RawPitchNote[] {
  const melodic = notes
    .filter((n) => n.pitchMidi >= RH_LO && n.pitchMidi <= RH_HI && n.durationSeconds >= 0.05)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || b.amplitude - a.amplitude)

  const kept: RawPitchNote[] = []
  for (const n of melodic) {
    const end = n.startTimeSeconds + n.durationSeconds
    const conflict = kept.find((k) => {
      const kEnd = k.startTimeSeconds + k.durationSeconds
      return n.startTimeSeconds < kEnd - 0.02 && end > k.startTimeSeconds + 0.02
    })
    if (!conflict) {
      kept.push(n)
      continue
    }
    const score = (x: RawPitchNote) => x.amplitude * 2 + (x.pitchMidi - RH_LO) * 0.01
    if (score(n) > score(conflict)) {
      kept.splice(kept.indexOf(conflict), 1, n)
    }
  }
  return kept
}

function monophonicMelodyPreferVocal(notes: RawPitchNote[]): RawPitchNote[] {
  const VOCAL_LO = 55
  const VOCAL_HI = 76
  const melodic = notes
    .filter((n) => n.pitchMidi >= RH_LO && n.pitchMidi <= RH_HI && n.durationSeconds >= 0.05)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || b.amplitude - a.amplitude)

  const kept: RawPitchNote[] = []
  const score = (x: RawPitchNote) => {
    const inVocal = x.pitchMidi >= VOCAL_LO && x.pitchMidi <= VOCAL_HI ? 1.35 : 1
    return x.amplitude * 2 * inVocal + (x.pitchMidi - RH_LO) * 0.005
  }
  for (const n of melodic) {
    const end = n.startTimeSeconds + n.durationSeconds
    const conflict = kept.find((k) => {
      const kEnd = k.startTimeSeconds + k.durationSeconds
      return n.startTimeSeconds < kEnd - 0.02 && end > k.startTimeSeconds + 0.02
    })
    if (!conflict) {
      kept.push(n)
      continue
    }
    if (score(n) > score(conflict)) {
      kept.splice(kept.indexOf(conflict), 1, n)
    }
  }
  return kept
}

function lhRootsFromNotes(
  notes: RawPitchNote[],
  bpm: number,
  measureCount: number,
  role: NoteRole = 'bass',
): NoteEvent[] {
  const beatsPerMeasure = 4
  const events: NoteEvent[] = []
  const low = notes.filter((n) => n.pitchMidi < 60)

  for (let m = 0; m < measureCount; m++) {
    const mStart = (m * beatsPerMeasure * 60) / bpm
    const mEnd = ((m + 1) * beatsPerMeasure * 60) / bpm
    const inMeasure = low.filter(
      (n) => n.startTimeSeconds >= mStart && n.startTimeSeconds < mEnd,
    )

    const pickRoot = (fromSec: number, toSec: number): number | null => {
      const slice = (inMeasure.length ? inMeasure : notes).filter(
        (n) => n.startTimeSeconds >= fromSec && n.startTimeSeconds < toSec,
      )
      if (!slice.length) return null
      let best = slice[0]!
      for (const n of slice) {
        if (
          n.pitchMidi < best.pitchMidi ||
          (n.pitchMidi === best.pitchMidi && n.amplitude > best.amplitude)
        ) {
          best = n
        }
      }
      const pc = ((best.pitchMidi % 12) + 12) % 12
      let midi = 48 + pc
      while (midi > LH_HI) midi -= 12
      while (midi < LH_LO) midi += 12
      return clampMidi(midi, LH_LO, LH_HI)
    }

    const beat1 = pickRoot(mStart, mStart + (60 / bpm) * 1.2)
    if (beat1 != null) {
      events.push({
        midi: beat1,
        startBeat: m * 4,
        durationBeats: 1.5,
        hand: 'lh',
        role,
      })
    }
    const beat3 = pickRoot(mStart + (60 / bpm) * 1.8, mStart + (60 / bpm) * 3.2)
    if (beat3 != null) {
      events.push({
        midi: beat3,
        startBeat: m * 4 + 2,
        durationBeats: 1.5,
        hand: 'lh',
        role,
      })
    }
  }
  return events
}

/** Sparse chord tones on weak beats (LH), roots-forward playability. */
function sparseHarmonyNotes(
  notes: RawPitchNote[],
  bpm: number,
  measureCount: number,
  primaryRh: NoteEvent[],
): NoteEvent[] {
  const gated = gateNotesForRole(notes, 'harmony', 0.5)
  const secondsPerBeat = 60 / bpm
  const events: NoteEvent[] = []
  const rhOccupied = (beat: number, midi: number) =>
    primaryRh.some(
      (r) =>
        Math.abs(r.startBeat - beat) < 0.2 &&
        Math.abs(((r.midi % 12) + 12) % 12 - (((midi % 12) + 12) % 12)) < 0.5,
    )

  for (let m = 0; m < measureCount; m++) {
    const mStart = (m * 4 * 60) / bpm
    const mEnd = ((m + 1) * 4 * 60) / bpm
    const inM = gated.filter(
      (n) => n.startTimeSeconds >= mStart && n.startTimeSeconds < mEnd,
    )
    if (!inM.length) continue
    // Pick at most one mid-register tone per measure (beat 2.5-ish)
    let best = inM[0]!
    for (const n of inM) {
      if (n.amplitude > best.amplitude) best = n
    }
    const pc = ((best.pitchMidi % 12) + 12) % 12
    let midi = 52 + pc // ~E3 band
    while (midi > 64) midi -= 12
    while (midi < 48) midi += 12
    midi = clampMidi(midi, 48, 64)
    const startBeat = m * 4 + 1.5
    if (rhOccupied(startBeat, midi)) continue
    events.push({
      midi,
      startBeat: quantizeBeat(startBeat),
      durationBeats: 1,
      hand: 'lh',
      role: 'harmony',
    })
  }

  // Also allow a few RH chord peeks if nothing conflicted — keep very sparse
  const rhExtras: NoteEvent[] = []
  for (const n of gated.slice(0, 24)) {
    const startBeat = quantizeBeat(n.startTimeSeconds / secondsPerBeat)
    if (rhOccupied(startBeat, n.pitchMidi)) continue
    if (rhExtras.length >= Math.max(2, Math.floor(measureCount / 2))) break
    if (Math.abs(startBeat % 1) > 0.01 && Math.abs(startBeat % 1 - 0.5) > 0.01) continue
    rhExtras.push({
      midi: clampMidi(n.pitchMidi, RH_LO, 76),
      startBeat,
      durationBeats: 0.5,
      hand: 'rh',
      role: 'harmony',
    })
  }
  return [...events, ...rhExtras.slice(0, 4)]
}

function ornamentNotes(
  notes: RawPitchNote[],
  bpm: number,
  primaryRh: NoteEvent[],
): NoteEvent[] {
  const gated = gateNotesForRole(notes, 'ornament', 0.45)
  const secondsPerBeat = 60 / bpm
  const events: NoteEvent[] = []
  for (const n of gated) {
    const startBeat = quantizeBeat(n.startTimeSeconds / secondsPerBeat, 0.125)
    const overlapsPrimary = primaryRh.some(
      (r) =>
        startBeat >= r.startBeat - 0.05 &&
        startBeat < r.startBeat + r.durationBeats &&
        Math.abs(r.midi - n.pitchMidi) < 2,
    )
    if (overlapsPrimary) continue
    // Cap density: skip if another ornament within 0.5 beat
    if (events.some((e) => Math.abs(e.startBeat - startBeat) < 0.5)) continue
    events.push({
      midi: clampMidi(n.pitchMidi, 67, RH_HI),
      startBeat,
      durationBeats: 0.25,
      hand: 'rh',
      role: 'ornament',
    })
    if (events.length >= 32) break
  }
  return events
}

export interface ArrangeOptions {
  /** Notes used for RH monophonic line (vocal stem or instrumental mix). */
  rhNotes: RawPitchNote[]
  /** Notes used for LH roots (usually full-mix pitch track). Defaults to rhNotes. */
  lhNotes?: RawPitchNote[]
  /** Full-mix notes for harmony / ornament leftovers (defaults to lhNotes). */
  mixNotes?: RawPitchNote[]
  title: string
  sourceDurationSec: number
  analyzer: Arrangement['analyzer']
  analyzerNote?: string
  preferVocalRange?: boolean
  /** Primary RH role label. */
  rhRole?: 'vocal' | 'melody'
  bpm?: number
  bpmSource?: BpmSource
  stems?: StemCharacterization
}

/**
 * Legacy single-pass arrange (demo / simple).
 */
export function arrangeDirectionB(
  rawNotes: RawPitchNote[],
  title: string,
  sourceDurationSec: number,
  analyzer: Arrangement['analyzer'],
  analyzerNote?: string,
): Arrangement {
  return arrangeDirectionBParts({
    rhNotes: rawNotes,
    lhNotes: rawNotes,
    title,
    sourceDurationSec,
    analyzer,
    analyzerNote,
    rhRole: 'melody',
  })
}

/**
 * Layered Direction-B arrangement:
 * - RH: vocal or melody (monophonic)
 * - LH: bass roots on strong beats
 * - optional harmony (sparse) + ornament (off by default in UI)
 */
export function arrangeDirectionBParts(opts: ArrangeOptions): Arrangement {
  const rhSource = opts.rhNotes
  const lhSource = opts.lhNotes ?? opts.rhNotes
  const mixSource = opts.mixNotes ?? lhSource
  const rhRole: 'vocal' | 'melody' = opts.rhRole ?? (opts.preferVocalRange ? 'vocal' : 'melody')

  let bpm: number
  let bpmSource: BpmSource
  if (opts.bpm != null) {
    bpm = opts.bpm
    bpmSource = opts.bpmSource ?? 'audio-autocorr'
  } else {
    bpm = estimateBpmFromOnsets(
      rhSource.length >= 2 ? rhSource : lhSource,
      opts.sourceDurationSec,
    )
    bpmSource = 'onset-median'
  }

  const presence = opts.stems
  const rhGated = gateNotesForRole(
    rhSource,
    rhRole,
    presence ? (rhRole === 'vocal' ? presence.vocal.presence : presence.melody.presence) : 0.6,
  )
  const melody = opts.preferVocalRange
    ? monophonicMelodyPreferVocal(rhGated.length ? rhGated : rhSource)
    : monophonicMelody(rhGated.length ? rhGated : rhSource)
  const secondsPerBeat = 60 / bpm

  const rh: NoteEvent[] = melody.map((n) => {
    const startBeat = quantizeBeat(n.startTimeSeconds / secondsPerBeat)
    const durBeats = Math.max(0.25, quantizeBeat(n.durationSeconds / secondsPerBeat))
    return {
      midi: clampMidi(n.pitchMidi, RH_LO, RH_HI),
      startBeat,
      durationBeats: durBeats,
      hand: 'rh' as const,
      role: rhRole,
    }
  })

  const lastBeat = Math.max(
    4,
    ...rh.map((n) => n.startBeat + n.durationBeats),
    opts.sourceDurationSec / secondsPerBeat || 4,
  )
  const measureCount = Math.min(16, Math.max(4, Math.ceil(lastBeat / 4)))

  const bassGated = gateNotesForRole(
    lhSource,
    'bass',
    presence?.bass.presence ?? 0.55,
  )
  const lh = lhRootsFromNotes(bassGated.length ? bassGated : lhSource, bpm, measureCount, 'bass')

  const harmony =
    (presence?.harmony.presence ?? 0.4) >= 0.25
      ? sparseHarmonyNotes(mixSource, bpm, measureCount, rh)
      : []
  const ornaments =
    (presence?.ornament.presence ?? 0.35) >= 0.2
      ? ornamentNotes(mixSource, bpm, rh)
      : []

  return {
    title: opts.title,
    bpm,
    bpmSource,
    beatsPerMeasure: 4,
    measureCount,
    notes: [...lh, ...rh, ...harmony, ...ornaments],
    analyzer: opts.analyzer,
    sourceDurationSec: opts.sourceDurationSec,
    analyzerNote: opts.analyzerNote,
    stems: opts.stems,
  }
}
