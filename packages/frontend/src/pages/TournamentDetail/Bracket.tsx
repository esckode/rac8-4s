import React, { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Match } from '@shared/types'
import { useTournament } from '../../hooks/useTournament'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { MatchCard } from '../../components/shared/MatchCard'
import { OrganizerBracket } from '../../components/shared/OrganizerBracket'
import { ScoreSubmitForm } from '../../components/ScoreSubmitForm'
import '../../styles/globals.css'

export const Bracket: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { bracket, isLoading, error, refetch } = useTournament(tournamentId || '')
  const { organizerRole } = usePermissions(tournamentId || '')
  const { isAuthenticated } = useAuth()
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null)

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

      {organizerRole ? (
        <OrganizerBracket rounds={bracket.rounds} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[--s-4]">
          {playableMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m as unknown as Match}
              userRole="player"
              onSubmitScore={setScoringMatchId}
            />
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
