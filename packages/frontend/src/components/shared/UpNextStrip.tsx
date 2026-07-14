/**
 * UpNextStrip — Player Personalization P6
 *
 * One glanceable strip at the top of the landing screen, fed by the P5
 * pending-actions payload: unscored matches, open polls, pending cards,
 * nearest deadline — each deep-links to its own screen. Renders only when
 * non-empty; no dismiss affordance (dismissing wouldn't unscore the match —
 * the nav badge shows the count regardless, decided 2026-07-13).
 */
import React from 'react'
import type { PendingActions } from '../../hooks/usePendingActions'

export interface UpNextStripProps {
  actions: PendingActions
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 14px', background: 'var(--ink-50)', borderRadius: 'var(--r-md)',
  textDecoration: 'none', color: 'var(--ink-900)', fontSize: 13, fontWeight: 500,
}

export const UpNextStrip: React.FC<UpNextStripProps> = ({ actions }) => {
  const { unscoredMatches, openPolls, pendingCards, nearestDeadline } = actions
  const isEmpty =
    unscoredMatches.length === 0 && openPolls.length === 0 && pendingCards.length === 0 && nearestDeadline === null

  if (isEmpty) return null

  return (
    <div data-testid="up-next-strip" style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-600)', letterSpacing: '0.12em' }}>UP NEXT</div>

      {unscoredMatches.map(m => (
        <a key={m.matchId} href={`/tournament/${m.tournamentId}/details`} data-testid="up-next-match" style={rowStyle}>
          <span aria-hidden="true">🎾</span>
          <span>Report vs {m.opponentName} · {m.tournamentName}</span>
        </a>
      ))}

      {openPolls.map(p => (
        <a key={p.pollId} href={`/groups/${p.groupId}`} data-testid="up-next-poll" style={rowStyle}>
          <span aria-hidden="true">🗳️</span>
          <span>{p.question} · {p.groupName}</span>
        </a>
      ))}

      {pendingCards.map(c => (
        <a key={c.cardId} href={`/groups/${c.groupId}`} data-testid="up-next-card" style={rowStyle}>
          <span aria-hidden="true">🤖</span>
          <span>Confirm with Coach · {c.groupName}</span>
        </a>
      ))}

      {nearestDeadline && (
        <a href={`/tournament/${nearestDeadline.tournamentId}/details`} data-testid="up-next-deadline" style={rowStyle}>
          <span aria-hidden="true">⏰</span>
          <span>Deadline · {nearestDeadline.tournamentName}</span>
        </a>
      )}
    </div>
  )
}
