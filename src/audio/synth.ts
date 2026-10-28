import { midiToFreq } from '../lib/notes'
import type { Midi } from '../types/music'

/** Lightweight Web Audio piano-ish tones for follow-along preview. */
export class PreviewSynth {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private active = new Map<string, { osc: OscillatorNode; gain: GainNode }>()

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.22
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  async resume(): Promise<void> {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  noteOn(midi: Midi, hand: 'rh' | 'lh', id: string): void {
    const ctx = this.ensure()
    if (!this.master) return
    this.noteOff(id)

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = hand === 'lh' ? 'triangle' : 'sine'
    osc.frequency.value = midiToFreq(midi)
    const peak = hand === 'lh' ? 0.35 : 0.5
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.02)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start()
    this.active.set(id, { osc, gain })
  }

  noteOff(id: string): void {
    const voice = this.active.get(id)
    if (!voice || !this.ctx) return
    const { osc, gain } = voice
    const t = this.ctx.currentTime
    try {
      gain.gain.cancelScheduledValues(t)
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.stop(t + 0.2)
    } catch {
      /* already stopped */
    }
    this.active.delete(id)
  }

  allOff(): void {
    for (const id of [...this.active.keys()]) this.noteOff(id)
  }

  dispose(): void {
    this.allOff()
    void this.ctx?.close()
    this.ctx = null
    this.master = null
  }
}
