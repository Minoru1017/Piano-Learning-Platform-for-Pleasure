import { useCallback, useState } from 'react'
import { createDemoArrangement } from './audio/demoArrangement'
import type { RecordingResult } from './audio/recorder'
import { Atmosphere } from './components/Atmosphere'
import { IdentifyScreen } from './components/IdentifyScreen'
import { PracticeView } from './components/PracticeView'
import { RecordScreen } from './components/RecordScreen'
import {
  IDLE_ATMOSPHERE,
  type AtmosphereEmotion,
} from './lib/atmosphereEmotion'
import type { Arrangement, AppPhase } from './types/music'

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('record')
  const [recording, setRecording] = useState<RecordingResult | null>(null)
  const [arrangement, setArrangement] = useState<Arrangement | null>(null)
  const [emotion, setEmotion] = useState<AtmosphereEmotion>(IDLE_ATMOSPHERE)

  const handleAtmosphere = useCallback((next: AtmosphereEmotion) => {
    setEmotion(next)
  }, [])

  function handleRecorded(result: RecordingResult) {
    if (recording?.objectUrl) URL.revokeObjectURL(recording.objectUrl)
    setRecording(result)
    setArrangement(null)
    setEmotion(IDLE_ATMOSPHERE)
    setPhase('identify')
  }

  function handleReady(arr: Arrangement) {
    setArrangement(arr)
    setEmotion(IDLE_ATMOSPHERE)
    setPhase('practice')
  }

  function handleRestart() {
    if (recording?.objectUrl) URL.revokeObjectURL(recording.objectUrl)
    setRecording(null)
    setArrangement(null)
    setEmotion(IDLE_ATMOSPHERE)
    setPhase('record')
  }

  const resting = phase !== 'practice'

  return (
    <div className="app app--white-piano" data-theme="soft-crystal">
      <Atmosphere emotion={emotion} resting={resting} />
      <main className="shell">
        {phase === 'record' && (
          <RecordScreen
            onRecorded={handleRecorded}
            onLoadDemo={() => {
              setArrangement(createDemoArrangement())
              setEmotion(IDLE_ATMOSPHERE)
              setPhase('practice')
            }}
          />
        )}
        {phase === 'identify' && recording && (
          <IdentifyScreen
            recording={recording}
            onReady={handleReady}
            onBack={handleRestart}
          />
        )}
        {phase === 'practice' && arrangement && (
          <PracticeView
            arrangement={arrangement}
            onRestart={handleRestart}
            onAtmosphere={handleAtmosphere}
          />
        )}
      </main>
    </div>
  )
}
