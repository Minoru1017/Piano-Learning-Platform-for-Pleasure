import type { AtmosphereEmotion } from '../lib/atmosphereEmotion'
import { IDLE_ATMOSPHERE } from '../lib/atmosphereEmotion'

interface AtmosphereProps {
  emotion?: AtmosphereEmotion
  /** Quiet resting state on home / identify */
  resting?: boolean
}

/**
 * Full-bleed environment: white field, soft prism, thin grid, radial breathe.
 * Driven by CSS variables from note emotion during follow-along.
 */
export function Atmosphere({ emotion = IDLE_ATMOSPHERE, resting = false }: AtmosphereProps) {
  const e = resting
    ? { ...IDLE_ATMOSPHERE, intensity: 0.05, prism: 0.08, breathe: 0.1 }
    : emotion

  const style = {
    ['--atm-hue' as string]: String(e.hue),
    ['--atm-intensity' as string]: String(e.intensity),
    ['--atm-prism' as string]: String(e.prism),
    ['--atm-breathe' as string]: String(e.breathe),
  }

  return (
    <div
      className={`atmosphere ${resting ? 'atmosphere--rest' : 'atmosphere--live'}`}
      style={style}
      data-role={e.role}
      aria-hidden
    >
      <div className="atmosphere__haze" />
      <div className="atmosphere__prism" />
      <div className="atmosphere__grid" />
      <div className="atmosphere__radial" />
      <div className="atmosphere__beam" />
    </div>
  )
}
