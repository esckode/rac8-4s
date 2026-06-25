/**
 * ChannelSwitcher — V5.2 thread model
 *
 * Renders the list of channels the viewer can switch to:
 *   1. Announcements (always present, read-only for players)
 *   2. DM threads — one per opponent the viewer has exchanged messages with
 *   3. Match threads — one per match the viewer has a thread for
 *
 * NOTE: There is deliberately NO "New DM" affordance.  A DM thread can only
 * be started via the "Message opponent" button on a match card.
 */

import React from 'react'

export interface DmThread {
  playerId: string
  displayName: string
}

export interface MatchThread {
  matchId: string
  label: string
  /** The opponent's player ID — used as recipientPlayerId when composing */
  opponentPlayerId?: string
}

export type ThreadKey = 'announcements' | `dm:${string}` | `match:${string}`

export interface ChannelSwitcherProps {
  activeThread: ThreadKey | null
  dmThreads: DmThread[]
  matchThreads: MatchThread[]
  onSelect: (thread: ThreadKey) => void
}

export const ChannelSwitcher: React.FC<ChannelSwitcherProps> = ({
  activeThread,
  dmThreads,
  matchThreads,
  onSelect,
}) => {
  return (
    <nav
      data-testid="channel-switcher"
      className="flex flex-col gap-0.5 p-2 border-r border-[--border] min-w-[160px] bg-[--ink-50]"
    >
      {/* Announcements channel */}
      <button
        data-testid="channel-announcements"
        aria-selected={activeThread === 'announcements'}
        onClick={() => onSelect('announcements')}
        className={`
          w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors
          ${activeThread === 'announcements'
            ? 'bg-[--court-100] text-[--court-700]'
            : 'text-[--ink-700] hover:bg-[--ink-100]'}
        `}
      >
        📢 Announcements
      </button>

      {/* DM threads */}
      {dmThreads.length > 0 && (
        <>
          <p className="px-3 pt-3 pb-1 text-xs font-semibold text-[--ink-500] uppercase tracking-wide">
            Direct
          </p>
          {dmThreads.map(({ playerId, displayName }) => {
            const key: ThreadKey = `dm:${playerId}`
            return (
              <button
                key={playerId}
                data-testid={`channel-dm-${playerId}`}
                aria-selected={activeThread === key}
                onClick={() => onSelect(key)}
                className={`
                  w-full text-left px-3 py-2 rounded text-sm transition-colors
                  ${activeThread === key
                    ? 'bg-[--court-100] text-[--court-700]'
                    : 'text-[--ink-700] hover:bg-[--ink-100]'}
                `}
              >
                {displayName}
              </button>
            )
          })}
        </>
      )}

      {/* Match threads */}
      {matchThreads.length > 0 && (
        <>
          <p className="px-3 pt-3 pb-1 text-xs font-semibold text-[--ink-500] uppercase tracking-wide">
            Matches
          </p>
          {matchThreads.map(({ matchId, label }) => {
            const key: ThreadKey = `match:${matchId}`
            return (
              <button
                key={matchId}
                data-testid={`channel-match-${matchId}`}
                aria-selected={activeThread === key}
                onClick={() => onSelect(key)}
                className={`
                  w-full text-left px-3 py-2 rounded text-sm transition-colors
                  ${activeThread === key
                    ? 'bg-[--court-100] text-[--court-700]'
                    : 'text-[--ink-700] hover:bg-[--ink-100]'}
                `}
              >
                {label}
              </button>
            )
          })}
        </>
      )}
    </nav>
  )
}
