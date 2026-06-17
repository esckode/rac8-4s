import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { confirmPartner } from '../api/client'
import '../styles/globals.css'

/**
 * PartnerRequestConfirm — the target of a doubles partnership request confirms it,
 * forming the team.
 *
 * Reads :registrationId from the route and confirms with the stored session token.
 * Only the requested partner can confirm (backend FORBIDDEN → friendly error);
 * a no-longer-pending request returns INVALID_STATE.
 */

const ERROR_MESSAGES: Record<string, string> = {
  FORBIDDEN: 'Only the requested partner can confirm this partnership.',
  INVALID_STATE: 'This partnership request is no longer pending.',
  NOT_FOUND: "We couldn't find that partnership request.",
}

function messageFor(code?: string): string {
  return (code && ERROR_MESSAGES[code]) || "Couldn't confirm the partnership. Please try again."
}

export const PartnerRequestConfirm: React.FC = () => {
  const { registrationId } = useParams<{ registrationId: string }>()
  const [status, setStatus] = useState<'idle' | 'confirming' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    if (!registrationId) {
      setError('Missing registration reference.')
      return
    }
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setError('You need to sign in again to confirm.')
      return
    }
    setStatus('confirming')
    try {
      await confirmPartner(registrationId, token)
      setStatus('done')
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      setError(messageFor(code))
      setStatus('idle')
    }
  }

  return (
    <div className="max-w-md mx-auto mt-[--s-12] px-[--s-4]">
      <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-6] space-y-[--s-4]">
        <h1 className="text-2xl font-bold text-[--ink-900]">Confirm Partnership</h1>

        {status === 'done' ? (
          <p data-testid="confirm-success" className="text-[--green-700]">
            Partnership confirmed — you're now a team for this tournament.
          </p>
        ) : (
          <>
            <p className="text-[--ink-600]">
              A player has asked to be your doubles partner. Confirm to form your team.
            </p>

            {error && (
              <p data-testid="confirm-error" role="alert" className="text-sm text-[--rose-700]">
                {error}
              </p>
            )}

            <button
              type="button"
              data-testid="confirm-partnership-button"
              onClick={handleConfirm}
              disabled={status === 'confirming'}
              className="w-full px-[--s-4] py-[--s-3] text-sm font-medium bg-[--court-600] text-white rounded-[--r-md] disabled:opacity-60"
            >
              {status === 'confirming' ? 'Confirming…' : 'Confirm Partnership'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
