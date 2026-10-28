import { useState } from 'react'
import { createDemoArrangement } from './audio/demoArrangement'
import type { RecordingResult } from './audio/recorder'
import { IdentifyScreen } from './components/IdentifyScreen'
import { PracticeView } from './components/PracticeView'
import { RecordScreen } from './components/RecordScreen'
import type { Arrangement, AppPhase } from './types/music'

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('record')
  const [recording, setRecording] = useState<RecordingResult | null>(null)
  const [arrangement, setArrangement] = useState<Arrangement | null>(null)

  function handleRecorded(result: RecordingResult) {
    if (recording?.objectUrl) URL.revokeObjectURL(recording.objectUrl)
    setRecording(result)
    setArrangement(null)
    setPhase('identify')
  }

  function handleReady(arr: Arrangement) {
    setArrangement(arr)
    setPhase('practice')
  }

  function handleRestart() {
    if (recording?.objectUrl) URL.revokeObjectURL(recording.objectUrl)
    setRecording(null)
    setArrangement(null)
    setPhase('record')
  }

  return (
    <div className="app app--cristofori" data-theme="cristofori-workshop">
      <div className="atmosphere" aria-hidden />
      <main className="shell">
        {phase === 'record' && (
          <RecordScreen
            onRecorded={handleRecorded}
            onLoadDemo={() => {
              setArrangement(createDemoArrangement())
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
          <PracticeView arrangement={arrangement} onRestart={handleRestart} />
        )}
      </main>
    </div>
  )
}
