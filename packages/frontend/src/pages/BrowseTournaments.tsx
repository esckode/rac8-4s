import React, { useState, useEffect } from 'react'

interface Tournament {
  id: string
  name: string
  sport: string
  matchFormat: 'singles' | 'doubles'
  maxPlayers: number
  registrationDeadline: string
  status: string
}

const coverColors: Record<string, string> = {
  court: '#FFD0B0',
  lavender: '#DCC6FA',
  mint: '#BFEACC',
  peach: '#FFD9C8',
  gold: '#F4EAA7',
}

export const BrowseTournaments: React.FC = () => {
  const [filterActive, setFilterActive] = useState('All')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchTournaments = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/tournaments/public', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch tournaments: ${response.statusText}`)
        }

        const data = await response.json()
        setTournaments(data.tournaments || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tournaments')
        setTournaments([])
      } finally {
        setLoading(false)
      }
    }

    fetchTournaments()
  }, [])

  const filteredTournaments = tournaments.filter(tournament => {
    if (filterActive === 'All') return true
    if (filterActive === 'Singles') return tournament.matchFormat === 'singles'
    if (filterActive === 'Doubles') return tournament.matchFormat === 'doubles'
    return true
  })

  const getColorForTournament = (index: number) => {
    const colors = ['court', 'lavender', 'mint', 'peach', 'gold']
    return colors[index % colors.length]
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
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-500)' }}>
            <p style={{ margin: 0 }}>Loading tournaments...</p>
          </div>
        )}

        {error && (
          <div style={{ padding: '16px 12px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 'var(--r-md)', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#991B1B', fontSize: '14px' }}>⚠️ {error}</p>
          </div>
        )}

        {!loading && filteredTournaments.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-500)' }}>
            <p style={{ margin: 0 }}>No tournaments available</p>
            <p style={{ margin: '8px 0 0', fontSize: 14 }}>Check back later for upcoming tournaments</p>
          </div>
        )}

        {!loading && filteredTournaments.length > 0 && (
          <>
            {/* Featured */}
            {filteredTournaments.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--court-600)', letterSpacing: '0.12em', marginBottom: 10 }}>
                  FEATURED
                </div>
                <div data-testid="tournament-list tournament-card" style={{ padding: 14, background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', marginBottom: 20, display: 'flex', gap: 14, cursor: 'pointer' }} onClick={() => window.location.href = `/tournament/${filteredTournaments[0].id}/browse`}>
                  <div style={{ width: 56, height: 56, borderRadius: 'var(--r-md)', background: coverColors[getColorForTournament(0)], flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>{filteredTournaments[0].name}</h3>
                    <div style={{ fontSize: 11, color: 'var(--ink-500)', marginTop: 2 }}>{filteredTournaments[0].sport}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', textTransform: 'capitalize' }}>
                        🎾 {filteredTournaments[0].sport}
                      </span>
                      <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', textTransform: 'capitalize' }}>
                        {filteredTournaments[0].matchFormat}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* All tournaments */}
            {filteredTournaments.length > 1 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--ink-900)' }}>All Tournaments</h3>
                  <span style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600 }}>{filteredTournaments.length} results</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredTournaments.slice(1).map((tournament, index) => (
                    <div
                      key={tournament.id}
                      data-testid="tournament-card"
                      style={{ padding: 14, background: '#fff', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-xl)', display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'pointer' }}
                      onClick={() => window.location.href = `/tournament/${tournament.id}/browse`}
                    >
                      <div style={{ width: 56, height: 56, borderRadius: 'var(--r-md)', background: coverColors[getColorForTournament(index + 1)], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ margin: '0 0 2px', fontSize: 16, fontWeight: 600, color: 'var(--ink-900)', letterSpacing: '-0.01em' }}>{tournament.name}</h4>
                        <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 8 }}>{tournament.sport}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', textTransform: 'capitalize' }}>
                            {tournament.status === 'registration_open' ? 'Reg Open' : tournament.status}
                          </span>
                          <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)', textTransform: 'capitalize' }}>
                            {tournament.matchFormat}
                          </span>
                          <span style={{ padding: '4px 8px', background: 'var(--ink-50)', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-900)' }}>
                            👥 Max {tournament.maxPlayers}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
