import React, { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ResponsiveLayout } from './components/shared'
import { Landing } from './pages/Landing'
import { BrowseTournaments } from './pages/BrowseTournaments'
import { Matches } from './pages/Matches'
import { TournamentDetail } from './pages/TournamentDetail'
import './styles/globals.css'

const MOCK_USER_TOURNAMENTS = [
  {
    id: '1',
    name: 'Friday Night Smash',
    status: 'live',
    group: 'Group A',
    teams: 4,
    yourRank: 1,
    wins: 3,
    losses: 0,
    points: 90,
  },
  {
    id: '2',
    name: 'Spring Singles Cup',
    status: 'upcoming',
    group: 'Singles',
    teams: 8,
    yourRank: 5,
    wins: 0,
    losses: 0,
    points: 0,
  },
  {
    id: '3',
    name: 'Mixed Doubles Friendly',
    status: 'completed',
    group: 'Mixed',
    teams: 6,
    yourRank: 2,
    wins: 5,
    losses: 1,
    points: 150,
  },
]

const Standings = () => {
  const [tournaments] = useState(MOCK_USER_TOURNAMENTS)

  const handleTournamentClick = (tournamentId: string) => {
    window.location.href = `/tournament/${tournamentId}/standings`
  }

  const handleBracketClick = (tournamentId: string) => {
    window.location.href = `/tournament/${tournamentId}/bracket`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--surface)' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600, color: 'var(--ink-900)' }}>My Standings</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500 }}>Your tournament results</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 110px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tournaments.map(tournament => (
            <div
              key={tournament.id}
              style={{ padding: 16, background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', transition: 'box-shadow 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, cursor: 'pointer' }} onClick={() => handleTournamentClick(tournament.id)}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{tournament.name}</h3>
                  <div style={{ fontSize: 12, color: 'var(--ink-500)' }}>{tournament.group}</div>
                </div>
                <span style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  background: tournament.status === 'live' ? 'var(--court-100)' : tournament.status === 'upcoming' ? 'var(--ink-50)' : 'var(--ink-50)',
                  color: tournament.status === 'live' ? 'var(--court-700)' : 'var(--ink-500)',
                  whiteSpace: 'nowrap',
                }}>
                  {tournament.status === 'live' ? '🔴 Live' : tournament.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, cursor: 'pointer' }} onClick={() => handleTournamentClick(tournament.id)}>
                  <div style={{ padding: 8, background: 'var(--ink-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase' }}>Rank</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)', marginTop: 4 }}>#{tournament.yourRank}</div>
                  </div>
                  <div style={{ padding: 8, background: 'var(--ink-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase' }}>Record</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', marginTop: 4 }}>{tournament.wins}W · {tournament.losses}L</div>
                  </div>
                  <div style={{ padding: 8, background: 'var(--ink-50)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-500)', fontWeight: 600, textTransform: 'uppercase' }}>Points</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)', marginTop: 4 }}>{tournament.points}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleBracketClick(tournament.id)}
                  style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', border: 'none', cursor: 'pointer', width: 'fit-content' }}
                  title="View bracket"
                >
                  🔀
                </button>
              </div>
            </div>
          ))}
        </div>

        {tournaments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-500)' }}>
            <p style={{ margin: 0 }}>No tournament standings yet</p>
            <p style={{ margin: '8px 0 0', fontSize: 14 }}>Join a tournament to see your standings here</p>
          </div>
        )}
      </div>
    </div>
  )
}


export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/browse"
          element={
            <ResponsiveLayout showHeader showNav>
              <BrowseTournaments />
            </ResponsiveLayout>
          }
        />
        <Route
          path="/matches"
          element={
            <ResponsiveLayout showHeader showNav>
              <Matches />
            </ResponsiveLayout>
          }
        />
        <Route
          path="/tournament/:tournamentId/:tab"
          element={
            <ResponsiveLayout showHeader showNav>
              <TournamentDetail />
            </ResponsiveLayout>
          }
        />
        <Route
          path="/tournament/:tournamentId"
          element={
            <Navigate to={`/tournament/:tournamentId/standings`} replace />
          }
        />
        <Route
          path="/standings"
          element={
            <ResponsiveLayout showHeader showNav>
              <Standings />
            </ResponsiveLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
