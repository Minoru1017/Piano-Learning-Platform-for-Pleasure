import { isBlackKey, midiToName, whiteKeyIndex } from '../lib/notes'
import type { Midi } from '../types/music'

export interface KeyHighlight {
  midi: Midi
  role: 'current' | 'upcoming'
  hand: 'rh' | 'lh'
}

interface PianoKeyboardProps {
  /** Inclusive MIDI range (white-key aligned preferred). */
  low: Midi
  high: Midi
  highlights: KeyHighlight[]
}

export function PianoKeyboard({ low, high, highlights }: PianoKeyboardProps) {
  const whites: Midi[] = []
  const blacks: Midi[] = []
  for (let m = low; m <= high; m++) {
    if (isBlackKey(m)) blacks.push(m)
    else whites.push(m)
  }

  const highlightMap = new Map<Midi, KeyHighlight>()
  for (const h of highlights) {
    const prev = highlightMap.get(h.midi)
    // Prefer current over upcoming if same key
    if (!prev || (prev.role === 'upcoming' && h.role === 'current')) {
      highlightMap.set(h.midi, h)
    }
  }

  const firstWhiteIdx = whiteKeyIndex(whites[0] ?? low)
  const whiteCount = whites.length

  return (
    <div className="piano" role="img" aria-label="虛擬鋼琴鍵盤">
      <div className="piano__bed">
        {whites.map((midi) => {
          const h = highlightMap.get(midi)
          const classes = [
            'piano__key',
            'piano__key--white',
            h ? `piano__key--${h.role}` : '',
            h ? `piano__key--${h.hand}` : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={midi}
              className={classes}
              data-midi={midi}
              style={{ width: `${100 / whiteCount}%` }}
              title={midiToName(midi)}
            >
              <span className="piano__label">{midiToName(midi)}</span>
            </div>
          )
        })}
        {blacks.map((midi) => {
          const h = highlightMap.get(midi)
          // Black keys share whiteKeyIndex with the white to their left; place on the boundary to the next white.
          const boundary = whiteKeyIndex(midi) - firstWhiteIdx + 1
          const widthPct = (100 / whiteCount) * 0.62
          const leftPct = (boundary / whiteCount) * 100 - widthPct / 2
          const classes = [
            'piano__key',
            'piano__key--black',
            h ? `piano__key--${h.role}` : '',
            h ? `piano__key--${h.hand}` : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <div
              key={midi}
              className={classes}
              data-midi={midi}
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
              }}
              title={midiToName(midi)}
            />
          )
        })}
      </div>
    </div>
  )
}
