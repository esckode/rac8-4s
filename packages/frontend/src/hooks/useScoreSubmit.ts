/**
 * useScoreSubmit - Score submission with exponential backoff retry logic
 *
 * Manages score submission with automatic retry: 4 total attempts with
 * delays of [immediate, 1s, 2s, 4s]. Tracks status through the submission
 * lifecycle: idle → submitting → retrying → success/failed.
 * After final failure, offers manual retry via retry() method.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { submitScore } from '../api/client'
import { useAuth } from './useAuth'

export type SubmitStatus = 'idle' | 'submitting' | 'retrying' | 'success' | 'queued' | 'failed'

export interface UseScoreSubmitReturn {
  status: SubmitStatus
  error: string | null
  attemptCount: number
  submit: (score: string) => void
  retry: (score?: string) => void
  cancel: () => void
}

const RETRY_DELAYS = [1000, 2000, 4000] // delays before retry attempts 1, 2, 3
const MAX_ATTEMPTS = 4

export function useScoreSubmit(
  tournamentId: string,
  matchId: string,
  matchType: 'group' | 'knockout' = 'group'
): UseScoreSubmitReturn {
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const { user } = useAuth()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const scoreRef = useRef<string>('')

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const trySubmit = useCallback(
    async (score: string, attempt: number) => {
      if (!user) return

      setAttemptCount(attempt)
      setStatus(attempt === 1 ? 'submitting' : 'retrying')

      try {
        const result = await submitScore(tournamentId, matchId, score, user.id, matchType)
        setStatus(result.queued ? 'queued' : 'success')
        setError(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Submission failed'
        if (attempt < MAX_ATTEMPTS) {
          setError(msg)
          setStatus('retrying')
          timerRef.current = setTimeout(() => {
            trySubmit(score, attempt + 1)
          }, RETRY_DELAYS[attempt - 1])
        } else {
          setStatus('failed')
          setError(msg)
        }
      }
    },
    [tournamentId, matchId, matchType, user]
  )

  const submit = useCallback(
    (score: string) => {
      if (!user) return
      clearTimer()
      scoreRef.current = score
      setError(null)
      setAttemptCount(0)
      trySubmit(score, 1)
    },
    [user, clearTimer, trySubmit]
  )

  const retry = useCallback(
    (score?: string) => {
      const scoreToUse = score ?? scoreRef.current
      if (!scoreToUse) return
      clearTimer()
      setAttemptCount(0)
      setError(null)
      trySubmit(scoreToUse, 1)
    },
    [clearTimer, trySubmit]
  )

  const cancel = useCallback(() => {
    clearTimer()
    setStatus('idle')
    setError(null)
    setAttemptCount(0)
  }, [clearTimer])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  return {
    status,
    error,
    attemptCount,
    submit,
    retry,
    cancel,
  }
}
