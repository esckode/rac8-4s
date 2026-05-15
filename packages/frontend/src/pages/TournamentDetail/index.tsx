import React, { useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import '../../../styles/tokens.css'

export const TournamentDetail: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated } = useAuth()
  const permissions = usePermissions(tournamentId || '')

  // Get current tab from URL pathname
  const currentPath = location.pathname
  const currentTab = useMemo(() => {
    if (currentPath.includes('/standings')) return 'standings'
    if (currentPath.includes('/matches')) return 'matches'
    if (currentPath.includes('/bracket')) return 'bracket'
    if (currentPath.includes('/details')) return 'details'
    return 'standings' // default
  }, [currentPath])

  if (!tournamentId) {
    return (
      <div
        className={`
          text-center
          py-[--s-12]
          rounded-[--r-lg]
          border
          border-dashed
          border-[--border]
          bg-[--ink-50]
        `}
      >
        <p className="text-lg text-[--ink-600]">Tournament not found</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div
        className={`
          text-center
          py-[--s-12]
          rounded-[--r-lg]
          border
          border-dashed
          border-[--border]
          bg-[--ink-50]
        `}
      >
        <p className="text-lg text-[--ink-600]">Sign in to view tournament details</p>
      </div>
    )
  }

  const tabs = [
    { id: 'standings', label: 'Standings', icon: '📊' },
    { id: 'matches', label: 'Matches', icon: '🎾' },
    { id: 'bracket', label: 'Bracket', icon: '🏆' },
    { id: 'details', label: 'Details', icon: 'ℹ️' },
  ]

  const handleTabClick = (tabId: string) => {
    navigate(`/tournament/${tournamentId}/${tabId}`)
  }

  const handleBackClick = () => {
    navigate(-1)
  }

  return (
    <div className="space-y-[--s-6]">
      {/* Header */}
      <div className="flex items-center gap-[--s-4]">
        <button
          onClick={handleBackClick}
          className={`
            px-[--s-3]
            py-[--s-2]
            text-[--ink-600]
            hover:text-[--ink-900]
            hover:bg-[--ink-100]
            rounded-[--r-md]
            transition-colors
            duration-[--duration-normal]
            focus:outline-none
            focus:ring-2
            focus:ring-[--court-400]
            focus:ring-offset-2
          `}
          aria-label="Go back"
        >
          ← Back
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold text-[--ink-900]">
          Tournament Details
        </h1>
      </div>

      {/* Tab Navigation */}
      <div
        className={`
          flex
          gap-[--s-2]
          overflow-x-auto
          border-b
          border-[--border]
          pb-[--s-2]
        `}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`
              flex
              items-center
              gap-[--s-2]
              px-[--s-4]
              py-[--s-3]
              text-sm
              sm:text-base
              font-medium
              rounded-t-[--r-md]
              transition-all
              duration-[--duration-normal]
              whitespace-nowrap
              ${
                currentTab === tab.id
                  ? 'bg-[--court-50] text-[--court-600] border-b-2 border-[--court-500]'
                  : 'text-[--ink-600] hover:text-[--ink-900] hover:bg-[--ink-50]'
              }
              focus:outline-none
              focus:ring-2
              focus:ring-[--court-400]
              focus:ring-offset-2
            `}
            aria-selected={currentTab === tab.id}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area - Placeholder for tab content */}
      <div
        className={`
          rounded-[--r-lg]
          border
          border-[--border]
          p-[--s-6]
          min-h-[400px]
          bg-white
        `}
      >
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-[--ink-900] mb-[--s-2]">
            {tabs.find((t) => t.id === currentTab)?.label}
          </h2>
          <p className="text-[--ink-600]">
            {currentTab.charAt(0).toUpperCase() + currentTab.slice(1)} tab content will appear here
          </p>
          <div className="mt-[--s-6] space-y-[--s-2] text-sm text-[--ink-500]">
            <p>Tournament ID: {tournamentId}</p>
            <p>User Role: {permissions.organizerRole ? 'Organizer' : 'Player'}</p>
            <p>Current User: {user?.email}</p>
          </div>
        </div>
      </div>

      {/* Debug Info (remove in production) */}
      {process.env.NODE_ENV === 'development' && (
        <div
          className={`
            rounded-[--r-lg]
            border
            border-[--lavender-200]
            p-[--s-4]
            bg-[--lavender-50]
            text-xs
            text-[--ink-600]
            space-y-[--s-1]
          `}
        >
          <p className="font-medium">Debug Info</p>
          <p>Current Tab: {currentTab}</p>
          <p>Tournament ID: {tournamentId}</p>
          <p>Is Organizer: {permissions.organizerRole ? 'yes' : 'no'}</p>
        </div>
      )}
    </div>
  )
}
