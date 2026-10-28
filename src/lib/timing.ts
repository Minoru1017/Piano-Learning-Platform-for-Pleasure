import type { Arrangement, LoopRange, NoteEvent } from '../types/music'

export function measureToBeat(measure: number, beatsPerMeasure: number): number {
  return measure * beatsPerMeasure
}

export function beatToMeasure(beat: number, beatsPerMeasure: number): number {
  return Math.floor(beat / beatsPerMeasure)
}

export function loopBeatSpan(loop: LoopRange, beatsPerMeasure: number): {
  startBeat: number
  endBeat: number
  lengthBeats: number
} {
  const startBeat = loop.startMeasure * beatsPerMeasure
  const lengthBeats = loop.measureCount * beatsPerMeasure
  return { startBeat, endBeat: startBeat + lengthBeats, lengthBeats }
}

export function notesInLoop(
  arrangement: Arrangement,
  loop: LoopRange,
): NoteEvent[] {
  const { startBeat, endBeat } = loopBeatSpan(loop, arrangement.beatsPerMeasure)
  return arrangement.notes.filter(
    (n) => n.startBeat >= startBeat && n.startBeat < endBeat,
  )
}

/** Active notes at a given absolute beat (within arrangement space). */
export function activeNotesAt(
  notes: NoteEvent[],
  beat: number,
  hand?: 'rh' | 'lh',
): NoteEvent[] {
  return notes.filter((n) => {
    if (hand && n.hand !== hand) return false
    return beat >= n.startBeat && beat < n.startBeat + n.durationBeats
  })
}

/** Notes that start soon (lookahead for upcoming highlight). */
export function upcomingNotes(
  notes: NoteEvent[],
  beat: number,
  lookaheadBeats: number,
  hand?: 'rh' | 'lh',
): NoteEvent[] {
  return notes.filter((n) => {
    if (hand && n.hand !== hand) return false
    return n.startBeat > beat && n.startBeat <= beat + lookaheadBeats
  })
}

export function beatToSeconds(beat: number, bpm: number, speed: number): number {
  return (beat * 60) / (bpm * speed)
}

export function secondsToBeat(sec: number, bpm: number, speed: number): number {
  return (sec * bpm * speed) / 60
}
