/**
 * Strict single-note (monophonic) enforcement for Easy extract mode.
 * At most one RH melody/vocal note sounds at a time — no overlapping pitches.
 */

import type { NoteEvent, NoteRole } from '../types/music'

export interface RawPitchNote {
  startTimeSeconds: number
  durationSeconds: number
  pitchMidi: number
  amplitude: number
}

const RH_LO = 48
const RH_HI = 84

const PRIMARY_ROLES: NoteRole[] = ['vocal', 'melody']

function scoreRaw(
  n: RawPitchNote,
  prevMidi: number | null,
  preferVocal: boolean,
): number {
  const VOCAL_LO = 55
  const VOCAL_HI = 76
  const vocalBoost =
    preferVocal && n.pitchMidi >= VOCAL_LO && n.pitchMidi <= VOCAL_HI ? 1.35 : 1
  const continuity =
    prevMidi == null ? 0 : Math.max(0, 8 - Math.abs(n.pitchMidi - prevMidi)) * 0.08
  // Prefer louder + longer + pitch continuity
  return n.amplitude * 2 * vocalBoost + n.durationSeconds * 0.6 + continuity
}

/**
 * Pre-quantize: keep a single non-overlapping melody line from raw BP notes.
 */
export function selectMonophonicRaw(
  notes: RawPitchNote[],
  preferVocal = false,
): RawPitchNote[] {
  const melodic = notes
    .filter((n) => n.pitchMidi >= RH_LO && n.pitchMidi <= RH_HI && n.durationSeconds >= 0.05)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || b.amplitude - a.amplitude)

  const kept: RawPitchNote[] = []
  for (const n of melodic) {
    const end = n.startTimeSeconds + n.durationSeconds
    const prev = kept.length ? kept[kept.length - 1]! : null
    const prevMidi = prev?.pitchMidi ?? null

    // Conflicts with any kept note that overlaps in time
    const conflicts = kept.filter((k) => {
      const kEnd = k.startTimeSeconds + k.durationSeconds
      return n.startTimeSeconds < kEnd - 0.02 && end > k.startTimeSeconds + 0.02
    })

    if (!conflicts.length) {
      kept.push(n)
      continue
    }

    // Prefer the new note only if it outscores every conflict; else drop it.
    // If it wins, remove conflicts (and optionally trim if only slight overlap).
    const nScore = scoreRaw(n, prevMidi, preferVocal)
    let replaceAll = true
    for (const c of conflicts) {
      const cPrev =
        kept[kept.indexOf(c) - 1]?.pitchMidi ?? prevMidi
      if (scoreRaw(c, cPrev ?? null, preferVocal) >= nScore) {
        replaceAll = false
        break
      }
    }
    if (!replaceAll) continue

    for (const c of [...conflicts]) {
      const idx = kept.indexOf(c)
      if (idx >= 0) kept.splice(idx, 1)
    }
    kept.push(n)
    kept.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  }

  // Final pass: if any residual overlap (float edge), truncate earlier note
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1]!
    const cur = kept[i]!
    const prevEnd = prev.startTimeSeconds + prev.durationSeconds
    if (cur.startTimeSeconds < prevEnd) {
      const trimmed = cur.startTimeSeconds - prev.startTimeSeconds - 0.01
      if (trimmed < 0.05) {
        // Drop the weaker of the two
        if (scoreRaw(cur, prev.pitchMidi, preferVocal) > scoreRaw(prev, null, preferVocal)) {
          kept.splice(i - 1, 1)
          i--
        } else {
          kept.splice(i, 1)
          i--
        }
      } else {
        prev.durationSeconds = trimmed
      }
    }
  }

  return kept
}

function intervalsOverlap(
  aStart: number,
  aDur: number,
  bStart: number,
  bDur: number,
  epsilon = 0.001,
): boolean {
  return aStart < bStart + bDur - epsilon && bStart < aStart + aDur - epsilon
}

/**
 * Post-quantize: ensure RH single-note roles never overlap in beat space.
 * Primary (vocal|melody) wins; ornaments/harmony RH only if gaps remain.
 * Same-start ties: keep louder-equivalent by longer duration then higher role priority.
 */
export function enforceMonophonicRhEvents(notes: NoteEvent[]): NoteEvent[] {
  const lh = notes.filter((n) => n.hand === 'lh')
  const rhPrimary = notes
    .filter((n) => n.hand === 'rh' && PRIMARY_ROLES.includes(n.role))
    .sort((a, b) => a.startBeat - b.startBeat || b.durationBeats - a.durationBeats)
  const rhOther = notes
    .filter((n) => n.hand === 'rh' && !PRIMARY_ROLES.includes(n.role))
    .sort((a, b) => a.startBeat - b.startBeat)

  const primaryOut: NoteEvent[] = []
  for (const n of rhPrimary) {
    const last = primaryOut[primaryOut.length - 1]
    if (!last) {
      primaryOut.push({ ...n })
      continue
    }
    if (n.startBeat <= last.startBeat + 0.001) {
      // Same (or earlier) attack — keep the longer note
      if (n.durationBeats > last.durationBeats) {
        primaryOut[primaryOut.length - 1] = { ...n }
      }
      continue
    }
    if (intervalsOverlap(last.startBeat, last.durationBeats, n.startBeat, n.durationBeats)) {
      const maxDur = Math.max(0.25, n.startBeat - last.startBeat)
      if (maxDur < 0.24) {
        // Too tight — drop the shorter/weaker new note
        continue
      }
      last.durationBeats = maxDur
    }
    primaryOut.push({ ...n })
  }

  const occupied = primaryOut
  const otherOut: NoteEvent[] = []
  for (const n of rhOther) {
    const hitsPrimary = occupied.some((p) =>
      intervalsOverlap(p.startBeat, p.durationBeats, n.startBeat, n.durationBeats),
    )
    if (hitsPrimary) continue
    const hitsOther = otherOut.some((p) =>
      intervalsOverlap(p.startBeat, p.durationBeats, n.startBeat, n.durationBeats),
    )
    if (hitsOther) continue
    otherOut.push({ ...n })
  }

  return [...lh, ...primaryOut, ...otherOut]
}
