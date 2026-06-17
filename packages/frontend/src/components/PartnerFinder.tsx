import React, { useEffect, useState } from 'react'
import { fetchAvailablePartners, sendPartnerRequest, type AvailablePartner } from '../api/client'

/**
 * PartnerFinder — a solo doubles registrant finds another solo registrant in the
 * same tournament and sends a partnership request.
 *
 * Mounted in the doubles player's tournament context while registration is open.
 * Loads available (solo) partners with the stored session token and lets the
 * player request one; the target confirms via PartnerRequestConfirm. Backend
 * error codes map to friendly messages; a 409 (already paired) keeps the list usable.
 */

interface PartnerFinderProps {
  tournamentId: string
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STATE: 'That player already has a partner. Pick someone else.',
  NOT_FOUND: "That player isn't available anymore.",
  VALIDATION_ERROR: "That request isn't valid.",
}

function messageFor(code?: string): string {
  return (code && ERROR_MESSAGES[code]) || "Couldn't send the request. Please try again."
}

export function PartnerFinder({ tournamentId }: PartnerFinderProps) {
  const [partners, setPartners] = useState<AvailablePartner[]>([])
  const [loading, setLoading] = useState(true)
  const [requestedId, setRequestedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setLoading(false)
      return
    }
    fetchAvailablePartners(tournamentId, token)
      .then((list) => {
        if (!cancelled) setPartners(list)
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load available partners.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tournamentId])

  const handleRequest = async (targetPlayerId: string) => {
    setError(null)
    const token = localStorage.getItem('auth_token')
    if (!token) {
      setError('You need to sign in again to send a request.')
      return
    }
    try {
      await sendPartnerRequest(tournamentId, targetPlayerId, token)
      setRequestedId(targetPlayerId)
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      setError(messageFor(code))
    }
  }

  return (
    <div
      data-testid="partner-finder"
      className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] space-y-[--s-3]"
    >
      <div>
        <h3 className="text-lg font-semibold text-[--ink-900]">Find a partner</h3>
        <p className="text-sm text-[--ink-600]">
          Request another solo registrant to team up for this doubles tournament.
        </p>
      </div>

      {error && (
        <p data-testid="partner-error" role="alert" className="text-sm text-[--rose-700]">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[--ink-500]">Loading available partners…</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-[--ink-500]">No available partners right now.</p>
      ) : (
        <ul className="space-y-[--s-2]">
          {partners.map((partner) => (
            <li
              key={partner.id}
              data-testid="partner-row"
              className="flex items-center justify-between gap-[--s-3] border border-[--border] rounded-[--r-md] px-[--s-3] py-[--s-2]"
            >
              <span className="text-[--ink-900]">{partner.name}</span>
              {requestedId === partner.id ? (
                <span className="text-sm text-[--ink-500]">Request pending</span>
              ) : (
                <button
                  type="button"
                  data-testid="request-partner-button"
                  onClick={() => handleRequest(partner.id)}
                  disabled={requestedId !== null}
                  className="px-[--s-3] py-[--s-2] text-sm font-medium bg-[--court-600] text-white rounded-[--r-md] disabled:opacity-60"
                >
                  Request
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
