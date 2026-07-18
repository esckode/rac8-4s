import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { Match } from '@shared/types'
import { useTournament } from '../../hooks/useTournament'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { MatchCard } from '../../components/shared/MatchCard'
import { OrganizerBracket } from '../../components/shared/OrganizerBracket'
import { ScoreSubmitForm } from '../../components/ScoreSubmitForm'
import { SnapshotUpdatedAt } from '../../pwa/SnapshotUpdatedAt'
import '../../styles/globals.css'

export const Bracket: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { bracket, isLoading, error, refetch, updatedAt } = useTournament(tournamentId || '')
  const { organizerRole } = usePermissions(tournamentId || '')
  const { isAuthenticated, user } = useAuth()
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null)
  const nextMatchRef = useRef<HTMLDivElement>(null)

  const knockoutMatches = useMemo(
    () => (bracket?.rounds ?? []).flatMap((r) => r.matches),
    [bracket]
  )
  // Player view is match-focused: only matches ready to play (both slots filled).
  const playableMatches = useMemo(
    () => knockoutMatches.filter((m) => m.player1Id && m.player2Id),
    [knockoutMatches]
  )
  const scoringMatch = knockoutMatches.find((m) => m.id === scoringMatchId) || null

  // P2 — center the bracket on the viewer's next match (same auto-scroll
  // intent as standings anchoring; this view is already a plain grid, not
  // virtualized, so a direct scrollIntoView is enough — no xyflow viewport
  // is touched here, that's the organizer-only flow-canvas variant).
  const myPlayerId = user?.playerId
  const nextMatchId = useMemo(() => {
    if (!myPlayerId) return null
    const mine = playableMatches.find(
      (m) => (m.player1Id === myPlayerId || m.player2Id === myPlayerId) && m.status !== 'completed'
    )
    return mine?.id ?? null
  }, [playableMatches, myPlayerId])

  useEffect(() => {
    nextMatchRef.current?.scrollIntoView({ block: 'center' })
  }, [nextMatchId])

  if (!isAuthenticated) {
    return (
      <div className="text-center py-[--s-12] rounded-[--r-lg] border border-dashed border-[--border] bg-[--ink-50]">
        <p className="text-lg text-[--ink-600]">Sign in to view bracket</p>
      </div>
    )
  }

  if (isLoading && !bracket) {
    return (
      <div className="space-y-[--s-6]">
        <h2 className="text-2xl font-bold text-[--ink-900]">Bracket</h2>
        <p className="text-[--ink-600]">Loading bracket...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-[--s-6]">
        <h2 className="text-2xl font-bold text-[--ink-900]">Bracket</h2>
        <div className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] text-[--rose-800]">
          <p className="font-medium">Failed to load bracket</p>
          <p className="text-sm mt-[--s-2]">{error.message}</p>
          <button
            onClick={refetch}
            className="text-sm text-[--rose-700] hover:text-[--rose-900] mt-[--s-3] underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!bracket) {
    return (
      <div className="space-y-[--s-6]">
        <h2 className="text-2xl font-bold text-[--ink-900]">Bracket</h2>
        <SnapshotUpdatedAt updatedAt={updatedAt} />
        <div
          data-testid="bracket-pending"
          className="bg-[--ink-50] border border-[--border] rounded-[--r-lg] p-[--s-8] text-center"
        >
          <p className="text-[--ink-600] font-medium">
            Bracket will appear when group stage completes
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-[--s-6]">
      <h2 className="text-2xl font-bold text-[--ink-900]">Bracket</h2>
      <SnapshotUpdatedAt updatedAt={updatedAt} />

      {organizerRole ? (
        <OrganizerBracket rounds={bracket.rounds} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[--s-4]">
          {playableMatches.map((m) => (
            <div
              key={m.id}
              ref={m.id === nextMatchId ? nextMatchRef : undefined}
              data-testid={m.id === nextMatchId ? 'match-card-you' : undefined}
            >
              <MatchCard
                match={m as unknown as Match}
                userRole="player"
                onSubmitScore={setScoringMatchId}
              />
            </div>
          ))}
        </div>
      )}

      {scoringMatch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-[--s-4]"
          onClick={() => setScoringMatchId(null)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <ScoreSubmitForm
              tournamentId={tournamentId || ''}
              match={{
                id: scoringMatch.id,
                status: scoringMatch.status,
                score: scoringMatch.score,
                type: 'knockout',
              }}
              onSuccess={() => {
                setScoringMatchId(null)
                refetch()
              }}
              onClose={() => setScoringMatchId(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
