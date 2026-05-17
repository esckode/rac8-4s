import React, { useState } from 'react'

export const BrowseTournaments: React.FC = () => {
  const [tournaments, setTournaments] = useState<any[]>([])

  return (
    <div style={{ padding: '20px' }}>
      <h1>Browse Tournaments</h1>
      <p>Tournaments: {tournaments.length}</p>
      <p>This page is under development</p>
    </div>
  )
}
