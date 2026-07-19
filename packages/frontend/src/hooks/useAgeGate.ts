import { useState } from 'react'

export type AgeGatePhase = 'none' | 'required' | 'underage'

export function useAgeGate() {
  const [ageGatePhase, setAgeGatePhase] = useState<AgeGatePhase>('none')

  const handleAgeCode = (code: string) => {
    if (code === 'AGE_ATTESTATION_REQUIRED') setAgeGatePhase('required')
    else if (code === 'UNDER_AGE') setAgeGatePhase('underage')
  }

  const dismissAgeGate = () => setAgeGatePhase('none')

  return { ageGatePhase, handleAgeCode, dismissAgeGate }
}
