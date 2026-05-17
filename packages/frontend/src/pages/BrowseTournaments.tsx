import React, { useState } from 'react'

const MOCK_TOURNAMENTS = [
  {
    id: '1',
    name: 'Greenwood Mixed Open',
    date: 'Sat 25 May',
    time: '1:00 PM',
    venue: 'Greenwood BC',
    cover: 'mint',
    phase: 'featured',
    players: 9,
    capacity: 24,
  },
  {
    id: '2',
    name: 'Spring Singles Cup',
    date: 'Sat 24 May',
    time: '10:30 AM',
    venue: 'Eastside Smash Hall',
    cover: 'gold',
    phase: 'reg-open',
    players: 22,
    capacity: 32,
  },
  {
    id: '3',
    name: 'Knockout Friday',
    date: 'Fri 16 May',
    time: '7:00 PM',
    venue: 'North End Club',
    cover: 'court',
    phase: 'knockout',
    players: 8,
    capacity: 8,
  },
]

const coverColors: Record<string, string> = {
  court: '#FFD0B0',
  lavender: '#DCC6FA',
  mint: '#BFEACC',
  peach: '#FFD9C8',
  gold: '#F4EAA7',
}

export const BrowseTournaments: React.FC = () => {
  const [filterActive, setFilterActive] = useState('All')

  const handleBracketClick = (tournamentId: string) => {
    window.location.href = `/tournament/${tournamentId}/bracket`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--surface)' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-soft)' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600, color: 'var(--ink-900)' }}>Browse</h1>
          <div style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 500 }}>Find a night, find a tournament</div>
        </div>
        <button style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18 }}>
          🔍
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', height: 44, background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border-soft)' }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <span style={{ fontSize: 14, color: 'var(--ink-400)' }}>Search clubs, players, venues…</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['All', 'Doubles', 'Singles', 'Mixed'].map(filter => (
          <button
            key={filter}
            onClick={() => setFilterActive(filter)}
            style={{
              padding: '6px 12px',
              border: `1px solid ${filterActive === filter ? 'var(--ink-900)' : 'var(--border-soft)'}`,
              borderRadius: 'var(--r-md)',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              background: filterActive === filter ? 'var(--ink-900)' : 'transparent',
              color: filterActive === filter ? '#fff' : 'var(--ink-900)',
              cursor: 'pointer',
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 110px' }}>
        {/* Featured */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-600)', letterSpacing: '0.12em', marginBottom: 10 }}>
          FEATURED · THIS WEEK
        </div>
        <div style={{ padding: 14, background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', marginBottom: 20, display: 'flex', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 'var(--r-md)', background: coverColors[MOCK_TOURNAMENTS[0].cover], flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{MOCK_TOURNAMENTS[0].name}</h3>
            <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>{MOCK_TOURNAMENTS[0].date}, {MOCK_TOURNAMENTS[0].time} · {MOCK_TOURNAMENTS[0].venue}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>🎾 Badminton</span>
              <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>Mixed</span>
              <button
                onClick={() => handleBracketClick(MOCK_TOURNAMENTS[0].id)}
                style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', border: 'none', cursor: 'pointer' }}
              >
                🔀 Bracket
              </button>
            </div>
          </div>
        </div>

        {/* Coming up */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>Coming up</h3>
          <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>{MOCK_TOURNAMENTS.length - 1} results</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MOCK_TOURNAMENTS.slice(1).map(tournament => (
            <div key={tournament.id} style={{ padding: 14, background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 56, height: 56, borderRadius: 'var(--r-md)', background: coverColors[tournament.cover], flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 600, color: 'var(--ink-900)', letterSpacing: '-0.01em' }}>{tournament.name}</h4>
                <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 8 }}>{tournament.date}, {tournament.time} · {tournament.venue}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>
                    {tournament.phase === 'reg-open' ? 'Reg Open' : tournament.phase === 'knockout' ? 'Knockout' : tournament.phase}
                  </span>
                  <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>
                    👥 {tournament.players}/{tournament.capacity}
                  </span>
                  <button
                    onClick={() => handleBracketClick(tournament.id)}
                    style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', border: 'none', cursor: 'pointer' }}
                  >
                    🔀 Bracket
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
