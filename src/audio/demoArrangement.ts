import type { Arrangement, NoteEvent } from '../types/music'

/** Fixed short arrangement for mic-less demos (Direction B caps). */
export function createDemoArrangement(): Arrangement {
  const notes: NoteEvent[] = []
  const melody = [
    [0, 60],
    [1, 62],
    [2, 64],
    [3, 65],
    [4, 67],
    [5, 65],
    [6, 64],
    [7, 62],
    [8, 60],
    [9, 64],
    [10, 67],
    [11, 72],
    [12, 71],
    [13, 67],
    [14, 65],
    [15, 64],
  ] as const

  for (const [beat, midi] of melody) {
    notes.push({ midi, startBeat: beat, durationBeats: 0.9, hand: 'rh', role: 'melody' })
  }

  for (let m = 0; m < 8; m++) {
    const roots = [48, 43, 45, 41]
    const root = roots[m % 4]!
    notes.push({ midi: root, startBeat: m * 4, durationBeats: 1.5, hand: 'lh', role: 'bass' })
    notes.push({
      midi: root,
      startBeat: m * 4 + 2,
      durationBeats: 1.5,
      hand: 'lh',
      role: 'bass',
    })
  }

  const phrase2 = [67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60, 62, 64, 65, 67, 60] as const
  for (let i = 0; i < phrase2.length; i++) {
    notes.push({
      midi: phrase2[i]!,
      startBeat: 16 + i,
      durationBeats: 0.9,
      hand: 'rh',
      role: 'melody',
    })
  }

  return {
    title: '示範・副歌四小節',
    bpm: 88,
    bpmSource: 'demo',
    beatsPerMeasure: 4,
    measureCount: 8,
    notes,
    analyzer: 'demo',
    analyzerNote: '內建示範編曲（非從錄音抽出）。',
    sourceDurationSec: 0,
  }
}
