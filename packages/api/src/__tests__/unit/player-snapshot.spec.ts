/**
 * S3.3 — 1:1 Coach: formatPlayerSnapshot (pure text composer) (RED first)
 *
 * COACH_1TO1_IMPLEMENTATION.md §0.5b / §S3.3: a deterministic ~300-token plain-
 * text block — next pending match, per-tournament standings + rank_reason,
 * last-5 results — assembled from ALREADY-FETCHED plain data (mirrors the
 * buildNudgeBody/buildDigest pure-composer convention: DB fetching is a
 * separate async orchestrator, buildPlayerSnapshot, tested at the integration
 * level in coach-snapshot.spec.ts).
 */

import { formatPlayerSnapshot, type PlayerSnapshotData } from '../../assistant/player-snapshot'

const EMPTY: PlayerSnapshotData = {
  nextMatch: null,
  standingsRows: [],
  lastResults: [],
}

describe('formatPlayerSnapshot', () => {
  it('renders the next match line with opponent, tournament, and deadline', () => {
    const text = formatPlayerSnapshot({
      ...EMPTY,
      nextMatch: { opponentName: 'Bob', tournamentName: 'Summer Open', deadline: '2026-08-01T18:00:00.000Z' },
    })
    expect(text).toContain('Bob')
    expect(text).toContain('Summer Open')
    expect(text).toContain('2026-08-01T18:00:00.000Z')
  })

  it('renders a short "none scheduled" line when there is no next match, never an error', () => {
    const text = formatPlayerSnapshot(EMPTY)
    expect(text).toMatch(/no upcoming match/i)
  })

  it('renders one standings line per tournament with rank and rank reason', () => {
    const text = formatPlayerSnapshot({
      ...EMPTY,
      standingsRows: [
        { tournamentName: 'Summer Open', rank: 1, wins: 3, losses: 0, rankReason: 'undefeated' },
        { tournamentName: 'Winter Cup', rank: 2, wins: 2, losses: 1, rankReason: 'won head-to-head vs Carol' },
      ],
    })
    expect(text).toContain('Summer Open')
    expect(text).toContain('undefeated')
    expect(text).toContain('Winter Cup')
    expect(text).toContain('won head-to-head vs Carol')
  })

  it('renders the last 5 results with W/L and score, most recent first', () => {
    const text = formatPlayerSnapshot({
      ...EMPTY,
      lastResults: [
        { opponentName: 'Bob', score: '6-4, 6-3', won: true },
        { opponentName: 'Carol', score: '4-6, 3-6', won: false },
      ],
    })
    expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Carol'))
    expect(text).toMatch(/W.*Bob.*6-4, 6-3/)
    expect(text).toMatch(/L.*Carol/)
  })

  it('renders a short "none yet" line when there are no results, never an error', () => {
    const text = formatPlayerSnapshot(EMPTY)
    expect(text).toMatch(/no results yet/i)
  })

  it('is deterministic: two calls with the same data produce byte-identical output', () => {
    const data: PlayerSnapshotData = {
      nextMatch: { opponentName: 'Bob', tournamentName: 'Summer Open', deadline: null },
      standingsRows: [{ tournamentName: 'Summer Open', rank: 1, wins: 3, losses: 0, rankReason: 'undefeated' }],
      lastResults: [{ opponentName: 'Bob', score: '6-4, 6-3', won: true }],
    }
    expect(formatPlayerSnapshot(data)).toBe(formatPlayerSnapshot(data))
  })

  it('stays under the ~1500 char budget for a realistic multi-tournament player', () => {
    const data: PlayerSnapshotData = {
      nextMatch: { opponentName: 'Bob', tournamentName: 'Summer Open', deadline: '2026-08-01T18:00:00.000Z' },
      standingsRows: Array.from({ length: 5 }, (_, i) => ({
        tournamentName: `Tournament ${i}`,
        rank: i + 1,
        wins: 3,
        losses: 1,
        rankReason: 'won more sets than tied players',
      })),
      lastResults: Array.from({ length: 5 }, (_, i) => ({
        opponentName: `Opponent ${i}`,
        score: '6-4, 6-3',
        won: i % 2 === 0,
      })),
    }
    expect(formatPlayerSnapshot(data).length).toBeLessThan(1500)
  })
})
