import React from 'react'

export interface SinglesStanding {
  participantId: string
  name: string
  rank: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

export interface DoublesStanding {
  participantId: string
  teamName: string
  players: Array<{ id: string; name: string }>
  rank: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

export type Standing = SinglesStanding | DoublesStanding

interface StandingsTableProps {
  standings: Standing[]
  format: 'singles' | 'doubles'
}

export function StandingsTable({ standings, format }: StandingsTableProps) {
  const isSingles = format === 'singles'
  const isDoubles = format === 'doubles'

  return (
    <div className="standings-table-container">
      <table className="standings-table">
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">{isSingles ? 'Player' : 'Team'}</th>
            <th scope="col">Wins</th>
            <th scope="col">Losses</th>
            <th scope="col">Sets W</th>
            <th scope="col">Sets L</th>
            <th scope="col">+/-</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((standing) => {
            const differential = standing.setsWon - standing.setsLost
            const key = isSingles
              ? (standing as SinglesStanding).participantId
              : (standing as DoublesStanding).participantId

            return (
              <tr key={key}>
                <td>{standing.rank}</td>
                <td>
                  {isSingles ? (
                    <span>{(standing as SinglesStanding).name}</span>
                  ) : (
                    <div className="team-cell">
                      <div className="team-name">{(standing as DoublesStanding).teamName}</div>
                      <div className="team-players">
                        {(standing as DoublesStanding).players
                          .map((p) => p.name)
                          .join(' & ')}
                      </div>
                    </div>
                  )}
                </td>
                <td>{standing.wins}</td>
                <td>{standing.losses}</td>
                <td>{standing.setsWon}</td>
                <td>{standing.setsLost}</td>
                <td className={`differential ${differential > 0 ? 'positive' : differential < 0 ? 'negative' : 'neutral'}`}>
                  {differential > 0 ? '+' : ''}{differential}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
