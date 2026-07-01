import React from 'react'

export interface IndividualRow { playerId: string; nameSnapshot?: string; wins: number; losses: number }
export interface PairRow { playerA: string; nameA?: string; playerB: string; nameB?: string; wins: number; losses: number }

interface LeaderboardPanelProps {
  individuals: IndividualRow[]
  pairs: PairRow[]
  loading?: boolean
}

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({ individuals, pairs, loading }) => {
  if (loading) return <p data-testid="leaderboard-loading">Loading leaderboard…</p>

  return (
    <div data-testid="leaderboard-panel">
      {/* Individual leaderboard */}
      <section data-testid="leaderboard-individual">
        <h3 className="text-sm font-semibold text-[--ink-800] mb-2">Individual</h3>
        {individuals.length === 0 ? (
          <p data-testid="leaderboard-individual-empty" className="text-xs text-[--ink-500]">No results yet.</p>
        ) : (
          <table className="w-full text-xs" data-testid="leaderboard-individual-table">
            <thead>
              <tr className="text-left text-[--ink-500]">
                <th className="pb-1">Player</th>
                <th className="pb-1 text-right">W</th>
                <th className="pb-1 text-right">L</th>
              </tr>
            </thead>
            <tbody>
              {individuals.map(r => (
                <tr key={r.playerId} data-testid="leaderboard-individual-row">
                  <td className="py-0.5 text-[--ink-700] truncate">{r.nameSnapshot ?? r.playerId}</td>
                  <td className="py-0.5 text-right text-[--ink-700]">{r.wins}</td>
                  <td className="py-0.5 text-right text-[--ink-500]">{r.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Pair leaderboard */}
      <section data-testid="leaderboard-pairs" className="mt-4">
        <h3 className="text-sm font-semibold text-[--ink-800] mb-2">Pairs</h3>
        {pairs.length === 0 ? (
          <p data-testid="leaderboard-pairs-empty" className="text-xs text-[--ink-500]">No pair data yet.</p>
        ) : (
          <table className="w-full text-xs" data-testid="leaderboard-pairs-table">
            <thead>
              <tr className="text-left text-[--ink-500]">
                <th className="pb-1">Partnership</th>
                <th className="pb-1 text-right">W</th>
                <th className="pb-1 text-right">L</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map(r => (
                <tr key={`${r.playerA}-${r.playerB}`} data-testid="leaderboard-pair-row">
                  <td className="py-0.5 text-[--ink-700] truncate">{r.nameA ?? r.playerA} + {r.nameB ?? r.playerB}</td>
                  <td className="py-0.5 text-right text-[--ink-700]">{r.wins}</td>
                  <td className="py-0.5 text-right text-[--ink-500]">{r.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
