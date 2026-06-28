/**
 * PollCard — G3.3
 *
 * Inline poll card rendered in the group chat stream for messages with type='poll'.
 * Shows the question, optional target time, vote buttons (In/Out/Maybe), and a live
 * tally. Closed polls show a frozen "Final:" tally with no vote buttons.
 *
 * The parent (GroupChatPanel) is responsible for:
 *   - Providing the current user's vote (currentUserVote)
 *   - Calling the vote API and updating state optimistically
 *   - Calling the close API and handling the response
 *   - Passing isOwner based on the member's role in the group
 */

import React from 'react'
import type { PollTally } from '../state/group-message-state'

export type PollChoice = 'in' | 'out' | 'maybe'

export interface PollCardProps {
  groupId: string
  messageId: string
  pollId: string
  question: string
  targetTime: string | null
  closedAt: string | null
  tally: PollTally
  currentUserVote: PollChoice | null
  isOwner: boolean
  onVote: (choice: PollChoice) => void
  onClose: () => void
}

function formatTargetTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export const PollCard: React.FC<PollCardProps> = ({
  question,
  targetTime,
  closedAt,
  tally,
  currentUserVote,
  isOwner,
  onVote,
  onClose,
}) => {
  const isClosed = closedAt != null

  return (
    <div
      data-testid="poll-card"
      className="rounded-lg border border-[--border] p-3 bg-[--ink-50] space-y-2"
    >
      {/* Question */}
      <p data-testid="poll-question" className="text-sm font-semibold text-[--ink-900]">
        {question}
      </p>

      {/* Target time */}
      {targetTime && (
        <p data-testid="poll-target-time" className="text-xs text-[--ink-500]">
          {formatTargetTime(targetTime)}
        </p>
      )}

      {/* Vote buttons — only shown on open polls */}
      {!isClosed && (
        <div className="flex gap-2">
          {(['in', 'out', 'maybe'] as PollChoice[]).map(choice => (
            <button
              key={choice}
              data-testid={`poll-vote-${choice}`}
              aria-pressed={currentUserVote === choice}
              onClick={() => onVote(choice)}
              className={[
                'flex-1 py-1.5 text-xs rounded border transition-colors',
                currentUserVote === choice
                  ? 'bg-[--court-500] text-white border-[--court-500]'
                  : 'bg-white text-[--ink-700] border-[--border] hover:border-[--court-400]',
              ].join(' ')}
            >
              {choice.charAt(0).toUpperCase() + choice.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Tally */}
      <p data-testid="poll-tally" className="text-xs text-[--ink-600]">
        {isClosed ? 'Final: ' : ''}
        {tally.in} in · {tally.out} out · {tally.maybe} maybe
      </p>

      {/* Close poll button — owner only, open polls only */}
      {isOwner && !isClosed && (
        <button
          data-testid="poll-close-button"
          onClick={onClose}
          className="text-xs text-[--ink-500] hover:text-[--rose-600] underline"
        >
          Close poll
        </button>
      )}
    </div>
  )
}
