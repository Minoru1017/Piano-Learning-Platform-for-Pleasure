import type { Arrangement, NoteEvent } from '../types/music'
import { clampMidi } from '../lib/notes'

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
    // Fallback: ~1 measure every 2s → ~120 bpm for 4/4
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
    // Prefer higher register + louder for RH melody guess
    const score = (x: RawPitchNote) => x.amplitude * 2 + (x.pitchMidi - RH_LO) * 0.01
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
      // Lowest pitch class weighted by amplitude
      let best = slice[0]!
      for (const n of slice) {
        if (n.pitchMidi < best.pitchMidi || (n.pitchMidi === best.pitchMidi && n.amplitude > best.amplitude)) {
          best = n
        }
      }
      const pc = ((best.pitchMidi % 12) + 12) % 12
      // Map to LH octave around C2–C3
      let midi = 48 + pc // C3 + pc
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
      })
    }
    const beat3 = pickRoot(mStart + (60 / bpm) * 1.8, mStart + (60 / bpm) * 3.2)
    if (beat3 != null) {
      events.push({
        midi: beat3,
        startBeat: m * 4 + 2,
        durationBeats: 1.5,
        hand: 'lh',
      })
    }
  }
  return events
}

/**
 * Turn Basic Pitch (or similar) raw notes into Direction-B arrangement:
 * RH monophonic quantized melody + LH strong-beat roots only.
 */
export function arrangeDirectionB(
  rawNotes: RawPitchNote[],
  title: string,
  sourceDurationSec: number,
  analyzer: Arrangement['analyzer'],
  analyzerNote?: string,
): Arrangement {
  const bpm = estimateBpmFromOnsets(rawNotes, sourceDurationSec)
  const melody = monophonicMelody(rawNotes)
  const secondsPerBeat = 60 / bpm

  const rh: NoteEvent[] = melody.map((n) => {
    const startBeat = quantizeBeat(n.startTimeSeconds / secondsPerBeat)
    const durBeats = Math.max(0.25, quantizeBeat(n.durationSeconds / secondsPerBeat))
    return {
      midi: clampMidi(n.pitchMidi, RH_LO, RH_HI),
      startBeat,
      durationBeats: durBeats,
      hand: 'rh' as const,
    }
  })

  const lastBeat = Math.max(
    4,
    ...rh.map((n) => n.startBeat + n.durationBeats),
    (sourceDurationSec / secondsPerBeat) || 4,
  )
  const measureCount = Math.min(16, Math.max(4, Math.ceil(lastBeat / 4)))
  const lh = lhRootsFromNotes(rawNotes, bpm, measureCount)

  return {
    title,
    bpm,
    beatsPerMeasure: 4,
    measureCount,
    notes: [...lh, ...rh],
    analyzer,
    sourceDurationSec,
    analyzerNote,
  }
}
