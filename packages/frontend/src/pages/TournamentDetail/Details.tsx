import React from 'react'
import { useParams } from 'react-router-dom'
import { useTournament } from '../../hooks/useTournament'
import { PartnerFinder } from '../../components/PartnerFinder'
import '../../styles/globals.css'

export const Details: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { tournament, isLoading, error, refetch } = useTournament(tournamentId || '')

  if (isLoading && !tournament) {
    return (
      <div className="space-y-[--s-6]">
        <h2 className="text-2xl font-bold text-[--ink-900]">Tournament Details</h2>
        <p className="text-[--ink-600]">Loading tournament details...</p>
      </div>
    )
  }

  if (error || !tournament) {
    return (
      <div className="space-y-[--s-6]">
        <h2 className="text-2xl font-bold text-[--ink-900]">Tournament Details</h2>
        <div className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] text-[--rose-800]">
          <p className="font-medium">Failed to load tournament details</p>
          {error && <p className="text-sm mt-[--s-2]">{error.message}</p>}
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

  const formatDate = (date: string | Date | undefined) => {
    if (!date) return 'Not set'
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Draft'
      case 'registration_open':
        return 'Registration Open'
      case 'registration_closed':
        return 'Registration Closed'
      case 'group_stage_active':
        return 'Group Stage Active'
      case 'group_stage_complete':
        return 'Group Stage Complete'
      case 'knockout_active':
        return 'Knockout Active'
      case 'tournament_complete':
        return 'Tournament Complete'
      default:
        return status
    }
  }

  const isCompleted = (status: string) => {
    return status === 'tournament_complete'
  }

  return (
    <div className="space-y-[--s-6]">
      <div>
        <h2 className="text-2xl font-bold text-[--ink-900]">Tournament Details</h2>
        <p className="text-sm text-[--ink-600] mt-[--s-1]">{tournament.name}</p>
      </div>

      {/* Partner finder — doubles only, while registration is open */}
      {tournament.matchFormat === 'doubles' && tournament.status === 'registration_open' && (
        <PartnerFinder tournamentId={tournamentId || ''} />
      )}

      {/* Tournament Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[--s-4]">
        {/* Basic Info */}
        <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] space-y-[--s-4]">
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Tournament Name</h3>
            <p className="text-lg font-medium text-[--ink-900]">{tournament.name}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Sport</h3>
            <p className="text-lg text-[--ink-900]">{tournament.sport || 'Tennis'}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Match Format</h3>
            <p className="text-lg text-[--ink-900]">
              {tournament.matchFormat ? tournament.matchFormat.charAt(0).toUpperCase() + tournament.matchFormat.slice(1) : 'Singles'}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Max Players</h3>
            <p className="text-lg text-[--ink-900]">{tournament.maxPlayers || 'Unlimited'}</p>
          </div>
        </div>

        {/* Status & Dates */}
        <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4] space-y-[--s-4]">
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Status</h3>
            <div className="inline-block">
              <span
                className={`
                  px-[--s-3]
                  py-[--s-2]
                  rounded-full
                  text-sm
                  font-medium
                  ${
                    isCompleted(tournament.status)
                      ? 'bg-[--green-50] text-[--green-700]'
                      : 'bg-[--court-50] text-[--court-600]'
                  }
                `}
              >
                {getStatusLabel(tournament.status)}
              </span>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Registration Deadline</h3>
            <p className="text-lg text-[--ink-900]">{formatDate(tournament.registrationDeadline)}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Group Stage Deadline</h3>
            <p className="text-lg text-[--ink-900]">{formatDate(tournament.groupStageDeadline)}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Knockout Stage Deadline</h3>
            <p className="text-lg text-[--ink-900]">{formatDate(tournament.knockoutStageDeadline)}</p>
          </div>
        </div>
      </div>

      {/* Description */}
      {tournament.description && (
        <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-4]">
          <h3 className="text-lg font-semibold text-[--ink-900] mb-[--s-3]">Description</h3>
          <p className="text-[--ink-700] leading-relaxed whitespace-pre-wrap">{tournament.description}</p>
        </div>
      )}

      {/* Tournament ID (for reference) */}
      <div className="bg-[--ink-50] border border-[--border] rounded-[--r-lg] p-[--s-4]">
        <h3 className="text-sm font-semibold text-[--ink-600] mb-[--s-2]">Tournament ID</h3>
        <p className="font-mono text-sm text-[--ink-700]">{tournament.id}</p>
      </div>
    </div>
  )
}
