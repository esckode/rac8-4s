import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { useTournament } from '../hooks/useTournament'
import {
  advanceTournament,
  generateBracket,
  publishBracket,
  type TransitionAction,
} from '../api/client'
import { CreateGroupsForm } from '../components/CreateGroupsForm'
import '../styles/globals.css'

/**
 * OrganizerManage — the tournament creator drives the lifecycle from one screen.
 *
 * Action shown is driven by tournament.status; the screen is gated on
 * usePermissions().canManageGroups (creator). Most transitions go through
 * advanceTournament; group creation and bracket publish perform their own
 * transitions. A GUARD_FAILED response offers an explicit force-advance.
 */

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TRANSITION: "That action isn't allowed from the current state.",
  GUARD_FAILED: 'Not ready to advance yet (e.g. scores still pending). You can force it.',
  INVALID_STATE: "That action isn't valid right now.",
  VALIDATION_ERROR: 'Something about that request was invalid.',
  BRACKET_NOT_GENERATED: 'Generate the bracket first.',
}

function messageFor(code?: string): string {
  return (code && ERROR_MESSAGES[code]) || 'Something went wrong. Please try again.'
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  registration_open: 'Registration open',
  registration_closed: 'Registration closed',
  group_stage_active: 'Group stage active',
  group_stage_complete: 'Group stage complete',
  knockout_active: 'Knockout active',
  tournament_complete: 'Tournament complete',
}

export const OrganizerManage: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const permissions = usePermissions(tournamentId || '')
  const { tournament, refetch } = useTournament(tournamentId || '')

  const [error, setError] = useState<string | null>(null)
  const [forceableAction, setForceableAction] = useState<TransitionAction | null>(null)
  const [busy, setBusy] = useState(false)

  if (!permissions.canManageGroups) {
    return (
      <div data-testid="not-authorized" className="max-w-lg mx-auto mt-[--s-12] text-center text-[--ink-600]">
        You don't have permission to manage this tournament.
      </div>
    )
  }

  if (!tournament) {
    return <p className="text-[--ink-500]">Loading…</p>
  }

  const token = () => localStorage.getItem('auth_token') || ''
  const status = tournament.status
  const isDoubles = tournament.matchFormat === 'doubles'

  const runAdvance = async (action: TransitionAction, force = false) => {
    setError(null)
    setBusy(true)
    try {
      if (force) {
        await advanceTournament(tournamentId!, action, token(), true)
      } else {
        await advanceTournament(tournamentId!, action, token())
      }
      setForceableAction(null)
      refetch()
    } catch (err) {
      const code = (err as { code?: string } | null)?.code
      setError(messageFor(code))
      if (code === 'GUARD_FAILED') setForceableAction(action)
    } finally {
      setBusy(false)
    }
  }

  const runGenerateAndPublish = async () => {
    setError(null)
    setBusy(true)
    try {
      await generateBracket(tournamentId!, token())
      await publishBracket(tournamentId!, token())
      refetch()
    } catch (err) {
      setError(messageFor((err as { code?: string } | null)?.code))
    } finally {
      setBusy(false)
    }
  }

  const actionButton = (testid: string, label: string, onClick: () => void) => (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={busy}
      className="px-[--s-4] py-[--s-3] text-sm font-medium bg-[--court-600] text-white rounded-[--r-md] disabled:opacity-60"
    >
      {label}
    </button>
  )

  const renderAction = () => {
    switch (status) {
      case 'draft':
        return actionButton('open-registration-button', 'Open registration', () => runAdvance('OPEN_REGISTRATION'))
      case 'registration_open':
        return actionButton('close-registration-button', 'Close registration', () => runAdvance('CLOSE_REGISTRATION'))
      case 'registration_closed':
        return <CreateGroupsForm tournamentId={tournamentId!} isDoubles={isDoubles} onCreated={refetch} />
      case 'group_stage_active':
        return actionButton('complete-group-stage-button', 'Complete group stage', () => runAdvance('COMPLETE_GROUP_STAGE'))
      case 'group_stage_complete':
        return actionButton('generate-bracket-button', 'Generate & publish bracket', runGenerateAndPublish)
      case 'knockout_active':
        return actionButton('complete-tournament-button', 'Complete tournament', () => runAdvance('COMPLETE_TOURNAMENT'))
      case 'tournament_complete':
        return <p className="text-[--green-700]">This tournament is complete.</p>
      default:
        return null
    }
  }

  return (
    <div className="max-w-2xl mx-auto mt-[--s-8] px-[--s-4] space-y-[--s-4]">
      <div>
        <h1 className="text-2xl font-bold text-[--ink-900]">Manage tournament</h1>
        <p className="text-sm text-[--ink-600] mt-[--s-1]">{tournament.name}</p>
        <p className="text-sm text-[--ink-500] mt-[--s-1]">
          Status: <span data-testid="manage-status" className="font-medium text-[--ink-700]">{status}</span>
          {STATUS_LABELS[status] ? ` (${STATUS_LABELS[status]})` : ''}
        </p>
      </div>

      <div className="bg-white border border-[--border] rounded-[--r-lg] p-[--s-6] space-y-[--s-3]">
        {renderAction()}

        {error && (
          <p data-testid="manage-error" role="alert" className="text-sm text-[--rose-700]">
            {error}
          </p>
        )}

        {forceableAction && (
          <button
            type="button"
            data-testid="force-advance-button"
            onClick={() => runAdvance(forceableAction, true)}
            disabled={busy}
            className="px-[--s-4] py-[--s-2] text-sm font-medium border border-[--rose-300] text-[--rose-700] rounded-[--r-md] disabled:opacity-60"
          >
            Force advance anyway
          </button>
        )}
      </div>
    </div>
  )
}
