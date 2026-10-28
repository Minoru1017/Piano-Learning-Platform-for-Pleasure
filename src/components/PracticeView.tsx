import { useEffect, useMemo, useRef, useState } from 'react'
import { PreviewSynth } from '../audio/synth'
import {
  activeNotesAt,
  beatToMeasure,
  loopBeatSpan,
  notesInLoop,
  secondsToBeat,
  upcomingNotes,
} from '../lib/timing'
import type { Arrangement, LoopRange } from '../types/music'
import { PianoKeyboard, type KeyHighlight } from './PianoKeyboard'

interface PracticeViewProps {
  arrangement: Arrangement
  onRestart: () => void
}

const SPEEDS = [0.5, 0.75, 1] as const

export function PracticeView({ arrangement, onRestart }: PracticeViewProps) {
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.75)
  const [muteRh, setMuteRh] = useState(false)
  const [muteLh, setMuteLh] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const [practicedToday, setPracticedToday] = useState(() => {
    try {
      return localStorage.getItem(`practiced:${arrangement.title}`) === todayKey()
    } catch {
      return false
    }
  })
  const [loop, setLoop] = useState<LoopRange>(() => ({
    startMeasure: 0,
    measureCount: Math.min(4, arrangement.measureCount),
  }))
  const [beat, setBeat] = useState(0)

  const synthRef = useRef(new PreviewSynth())
  const rafRef = useRef<number | null>(null)
  const playOriginRef = useRef<{ perf: number; beat: number } | null>(null)
  const soundingRef = useRef(new Set<string>())

  const loopNotes = useMemo(() => notesInLoop(arrangement, loop), [arrangement, loop])
  const { startBeat, endBeat, lengthBeats } = useMemo(
    () => loopBeatSpan(loop, arrangement.beatsPerMeasure),
    [loop, arrangement.beatsPerMeasure],
  )

  // Keep beat inside loop when loop changes
  useEffect(() => {
    setBeat((b) => {
      if (b < startBeat || b >= endBeat) return startBeat
      return b
    })
  }, [startBeat, endBeat])

  useEffect(() => {
    const synth = synthRef.current
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      synth.dispose()
    }
  }, [])

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      playOriginRef.current = null
      synthRef.current.allOff()
      soundingRef.current.clear()
      return
    }

    void synthRef.current.resume()
    playOriginRef.current = { perf: performance.now(), beat }

    const tick = () => {
      const origin = playOriginRef.current
      if (!origin) return
      const elapsedSec = (performance.now() - origin.perf) / 1000
      let abs = origin.beat + secondsToBeat(elapsedSec, arrangement.bpm, speed)
      if (abs >= endBeat) {
        const over = ((abs - startBeat) % lengthBeats + lengthBeats) % lengthBeats
        abs = startBeat + over
        playOriginRef.current = { perf: performance.now(), beat: abs }
      }
      setBeat(abs)
      syncVoices(abs)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // syncVoices closes over mute/loop; restart effect when those change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, endBeat, startBeat, lengthBeats, arrangement.bpm, muteRh, muteLh, loopNotes])

  function syncVoices(atBeat: number) {
    const synth = synthRef.current
    const desired = new Set<string>()
    for (const n of activeNotesAt(loopNotes, atBeat)) {
      if (n.hand === 'rh' && muteRh) continue
      if (n.hand === 'lh' && muteLh) continue
      const id = `${n.hand}:${n.startBeat}:${n.midi}`
      desired.add(id)
      if (!soundingRef.current.has(id)) {
        synth.noteOn(n.midi, n.hand, id)
        soundingRef.current.add(id)
      }
    }
    for (const id of soundingRef.current) {
      if (!desired.has(id)) {
        synth.noteOff(id)
        soundingRef.current.delete(id)
      }
    }
  }

  const highlights: KeyHighlight[] = useMemo(() => {
    const list: KeyHighlight[] = []
    const add = (role: 'current' | 'upcoming', hand: 'rh' | 'lh') => {
      if (hand === 'rh' && muteRh) return
      if (hand === 'lh' && muteLh) return
      const notes =
        role === 'current'
          ? activeNotesAt(loopNotes, beat, hand)
          : upcomingNotes(loopNotes, beat, 0.75, hand)
      for (const n of notes) {
        list.push({ midi: n.midi, role, hand })
      }
    }
    add('upcoming', 'rh')
    add('upcoming', 'lh')
    add('current', 'rh')
    add('current', 'lh')
    return list
  }, [loopNotes, beat, muteRh, muteLh])

  const measure = beatToMeasure(beat, arrangement.beatsPerMeasure)
  const beatInMeasure = beat - measure * arrangement.beatsPerMeasure

  function togglePracticed() {
    const next = !practicedToday
    setPracticedToday(next)
    try {
      if (next) localStorage.setItem(`practiced:${arrangement.title}`, todayKey())
      else localStorage.removeItem(`practiced:${arrangement.title}`)
    } catch {
      /* ignore */
    }
  }

  function setLoopStart(start: number) {
    const maxStart = Math.max(0, arrangement.measureCount - loop.measureCount)
    setLoop((l) => ({ ...l, startMeasure: Math.min(Math.max(0, start), maxStart) }))
  }

  function setLoopCount(count: number) {
    const c = Math.min(Math.max(1, count), arrangement.measureCount)
    setLoop((l) => {
      const maxStart = Math.max(0, arrangement.measureCount - c)
      return {
        startMeasure: Math.min(l.startMeasure, maxStart),
        measureCount: c,
      }
    })
  }

  const sheetNotes = useMemo(() => {
    return [...loopNotes]
      .sort((a, b) => a.startBeat - b.startBeat || (a.hand === 'lh' ? -1 : 1))
      .slice(0, 48)
  }, [loopNotes])

  return (
    <section className="screen screen--practice">
      <header className="practice-top">
        <div>
          <p className="brand brand--inline">跟彈</p>
          <h1 className="practice-title">{arrangement.title}</h1>
          <p className="practice-sub">
            {arrangement.bpm} BPM · {arrangement.measureCount} 小節 ·{' '}
            {arrangement.analyzer === 'demo' ? 'Demo 分析器' : 'Basic Pitch'}
            <span className="dot">·</span>
            來源 {arrangement.sourceDurationSec.toFixed(1)}s 錄音
          </p>
        </div>
        <button type="button" className="btn btn--ghost btn--small" onClick={onRestart}>
          新錄音
        </button>
      </header>

      <div className="practice-hero">
        <div className="measure-readout" aria-live="polite">
          <span className="measure-readout__label">小節</span>
          <span className="measure-readout__value">
            {measure + 1}
            <span className="measure-readout__beat">:{Math.floor(beatInMeasure) + 1}</span>
          </span>
          <span className="measure-readout__loop">
            循環 {loop.startMeasure + 1}–{loop.startMeasure + loop.measureCount}
          </span>
        </div>

        <PianoKeyboard low={36} high={84} highlights={highlights} />

        <div className="legend">
          <span className="legend__item legend__item--now">現在</span>
          <span className="legend__item legend__item--next">即將</span>
          <span className="legend__item legend__item--rh">右手</span>
          <span className="legend__item legend__item--lh">左手根音</span>
        </div>
      </div>

      <div className="transport">
        <button
          type="button"
          className="btn btn--primary btn--play"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? '暫停' : '播放'}
        </button>

        <div className="control-group" role="group" aria-label="速度">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip ${speed === s ? 'chip--on' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s === 1 ? '原速' : `${s}×`}
            </button>
          ))}
        </div>

        <div className="control-group" role="group" aria-label="左右手">
          <button
            type="button"
            className={`chip ${!muteRh ? 'chip--on' : ''}`}
            onClick={() => setMuteRh((m) => !m)}
            aria-pressed={!muteRh}
          >
            RH {muteRh ? '靜音' : '開'}
          </button>
          <button
            type="button"
            className={`chip ${!muteLh ? 'chip--on' : ''}`}
            onClick={() => setMuteLh((m) => !m)}
            aria-pressed={!muteLh}
          >
            LH {muteLh ? '靜音' : '開'}
          </button>
        </div>
      </div>

      <div className="loop-controls">
        <label className="loop-field">
          <span>起小節</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, arrangement.measureCount - loop.measureCount)}
            value={loop.startMeasure}
            onChange={(e) => setLoopStart(Number(e.target.value))}
          />
          <em>{loop.startMeasure + 1}</em>
        </label>
        <label className="loop-field">
          <span>循環長度（小節）</span>
          <input
            type="range"
            min={1}
            max={arrangement.measureCount}
            value={loop.measureCount}
            onChange={(e) => setLoopCount(Number(e.target.value))}
          />
          <em>{loop.measureCount}</em>
        </label>
        <div className="loop-presets">
          {[2, 4, 8].map((n) => (
            <button
              key={n}
              type="button"
              className={`chip ${loop.measureCount === n ? 'chip--on' : ''}`}
              disabled={n > arrangement.measureCount}
              onClick={() => setLoopCount(n)}
            >
              {n} 小節
            </button>
          ))}
        </div>
      </div>

      <div className="practice-footer">
        <label className="habit">
          <input type="checkbox" checked={practicedToday} onChange={togglePracticed} />
          <span>今天練完這段了嗎？</span>
        </label>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          onClick={() => setShowSheet((s) => !s)}
        >
          {showSheet ? '隱藏簡譜提示' : '顯示簡譜提示（可選）'}
        </button>
      </div>

      {showSheet && (
        <div className="sheet" aria-label="簡譜提示">
          <p className="sheet__note">譜面為次要參考；跟彈以鍵盤高亮為主。v1 不做對錯偵測。</p>
          <ul className="sheet__list">
            {sheetNotes.map((n) => (
              <li key={`${n.hand}-${n.startBeat}-${n.midi}`}>
                <span className={`hand-tag hand-tag--${n.hand}`}>{n.hand.toUpperCase()}</span>
                m{beatToMeasure(n.startBeat, 4) + 1} · beat{' '}
                {(n.startBeat % 4) + 1} · MIDI {n.midi}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
