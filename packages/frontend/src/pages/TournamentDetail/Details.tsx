import React from 'react'
import { useParams } from 'react-router-dom'

export const Details: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()

  return (
    <div className="text-center py-12">
      <h2 className="text-2xl font-bold text-[--ink-900] mb-[--s-2]">Details</h2>
      <p className="text-[--ink-600]">Tournament details tab content for tournament {tournamentId}</p>
    </div>
  )
}
