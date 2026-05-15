import React, { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useTournament } from '../../hooks/useTournament'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { Badge } from '../../components/shared/Badge'
import '../../styles/tokens.css'

export const Bracket: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { bracket, matches, isLoading, error, refetch } = useTournament(tournamentId || '')
  const { organizerRole } = usePermissions(tournamentId || '')
  const { user } = useAuth()

  const knockoutMatches = useMemo(() => {
    return matches.knockout || []
  }, [matches])

  const playerMatches = useMemo(() => {
    if (!user?.id) return []
    return knockoutMatches.filter(
      (m) => m.player1Id === user.id || m.player2Id === user.id
    )
  }, [knockoutMatches, user?.id])

  const currentMatch = useMemo(() => {
    return playerMatches.find((m) => m.status === 'pending') || null
  }, [playerMatches])

  const completedMatches = useMemo(() => {
    return playerMatches.filter((m) => m.status === 'completed')
  }, [playerMatches])

  const getOpponentName = (match: typeof knockoutMatches[0], userId: string) => {
    if (match.player1Id === userId) {
      return match.player2Id || 'TBD'
    }
    return match.player1Id || 'TBD'
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

  // Player view: Current match, next match, history
  if (!organizerRole && user?.id) {
    return (
      <div className="space-y-[--s-6]">
        <div>
          <h2 className="text-2xl font-bold text-[--ink-900]">Your Bracket</h2>
          <p className="text-sm text-[--ink-600] mt-[--s-1]">
            {completedMatches.length > 0 && `${completedMatches.length} matches completed`}
          </p>
        </div>

        {currentMatch ? (
          <div className="space-y-[--s-4]">
            <div>
              <h3 className="text-lg font-semibold text-[--ink-900] mb-[--s-3]">Current Match</h3>
              <div className="bg-white border border-[--court-300] rounded-[--r-lg] p-[--s-4] space-y-[--s-3]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[--ink-600]">Opponent</p>
                    <p className="text-xl font-semibold text-[--ink-900]">
                      {getOpponentName(currentMatch, user.id)}
                    </p>
                  </div>
                  <Badge variant="live">Pending</Badge>
                </div>
              </div>
            </div>

            {/* Submit score placeholder */}
            <button
              className="w-full px-[--s-4] py-[--s-3] bg-[--court-500] text-white rounded-[--r-lg] font-medium hover:bg-[--court-600] transition-colors"
            >
              Submit Score
            </button>
          </div>
        ) : (
          <div className="bg-[--ink-50] border border-[--border] rounded-[--r-lg] p-[--s-8] text-center">
            <p className="text-[--ink-600] font-medium">
              {completedMatches.length === 0 ? 'No matches scheduled yet' : 'Tournament completed!'}
            </p>
          </div>
        )}

        {completedMatches.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-[--ink-900] mb-[--s-3]">Match History</h3>
            <div className="space-y-[--s-3]">
              {completedMatches.map((match) => (
                <div
                  key={match.id}
                  className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm text-[--ink-600]">vs {getOpponentName(match, user.id)}</p>
                    {match.score && (
                      <p className="text-lg font-semibold text-[--ink-900]">{match.score}</p>
                    )}
                  </div>
                  <Badge variant="complete">Completed</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Organizer view: Bracket visualization
  if (organizerRole) {
    return (
      <div className="space-y-[--s-6]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[--s-4]">
          <div>
            <h2 className="text-2xl font-bold text-[--ink-900]">Tournament Bracket</h2>
            <p className="text-sm text-[--ink-600] mt-[--s-1]">
              {bracket ? `${knockoutMatches.length} knockout matches` : 'Bracket not generated yet'}
            </p>
          </div>
          <button
            className="px-[--s-4] py-[--s-3] bg-[--court-500] text-white rounded-[--r-lg] font-medium hover:bg-[--court-600] transition-colors whitespace-nowrap"
          >
            Generate Bracket
          </button>
        </div>

        {!bracket || knockoutMatches.length === 0 ? (
          <div className="bg-[--ink-50] border border-[--border] rounded-[--r-lg] p-[--s-8] text-center">
            <p className="text-[--ink-600] font-medium mb-[--s-4]">
              Bracket not generated yet
            </p>
            <p className="text-sm text-[--ink-500] mb-[--s-4]">
              Generate a bracket to start the knockout stage
            </p>
            <button
              className="px-[--s-4] py-[--s-2] bg-[--court-500] text-white rounded-[--r-md] font-medium hover:bg-[--court-600] transition-colors"
            >
              Generate Now
            </button>
          </div>
        ) : (
          <div className="space-y-[--s-4]">
            {/* Simple bracket visualization as list */}
            <div className="bg-white border border-[--border] rounded-[--r-lg] overflow-hidden">
              <div className="grid grid-cols-1 gap-0 divide-y divide-[--border]">
                {knockoutMatches.map((match) => (
                  <div
                    key={match.id}
                    className="p-[--s-4] flex items-center justify-between hover:bg-[--ink-50] transition-colors"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-[--ink-600] mb-[--s-1]">
                        {match.player1Id || 'TBD'} vs {match.player2Id || 'TBD'}
                      </p>
                      {match.score && (
                        <p className="font-semibold text-[--ink-900]">{match.score}</p>
                      )}
                    </div>
                    <Badge variant={match.status === 'completed' ? 'complete' : 'live'}>
                      {match.status === 'completed' ? 'Completed' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-[--s-3]">
              <button className="flex-1 px-[--s-4] py-[--s-3] bg-[--ink-100] text-[--ink-900] rounded-[--r-lg] font-medium hover:bg-[--ink-200] transition-colors">
                Edit Seeding
              </button>
              <button className="flex-1 px-[--s-4] py-[--s-3] bg-[--court-500] text-white rounded-[--r-lg] font-medium hover:bg-[--court-600] transition-colors">
                Publish Bracket
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      <p className="text-[--ink-600]">Loading bracket...</p>
    </div>
  )
}
