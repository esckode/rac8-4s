import React from 'react'
import { useParams } from 'react-router-dom'

export const Matches: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()

  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold text-[--ink-900] mb-[--s-2]">Matches</h2>
      <p className="text-[--ink-600]">Matches tab content for tournament {tournamentId}</p>
    </div>
  )
}
