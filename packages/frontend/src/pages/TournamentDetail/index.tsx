import React, { useMemo, Suspense, lazy } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import { useAuth } from '../../hooks/useAuth'
import { useSSE } from '../../hooks/useSSE'
import { useTournament } from '../../hooks/useTournament'
import { Standings } from './Standings'
import { SkeletonLoader } from '../../components/shared/SkeletonLoader'
import '../../../styles/globals.css'

// Lazy-load non-critical tabs for code splitting
const Matches = lazy(() => import('./Matches').then(m => ({ default: m.Matches })))
const Bracket = lazy(() => import('./Bracket').then(m => ({ default: m.Bracket })))
const Details = lazy(() => import('./Details').then(m => ({ default: m.Details })))

export const TournamentDetail: React.FC = () => {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated } = useAuth()
  const permissions = usePermissions(tournamentId || '')
  const sseState = useSSE(tournamentId || '')
  const { error, refetch, retryIn, cancelAutoRetry } = useTournament(tournamentId || '')

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

  const renderTabContent = () => {
    switch (currentTab) {
      case 'standings':
        return <Standings />
      case 'matches':
        return (
          <Suspense fallback={<SkeletonLoader count={3} height="60px" />}>
            <Matches />
          </Suspense>
        )
      case 'bracket':
        return (
          <Suspense fallback={<SkeletonLoader count={2} height="80px" />}>
            <Bracket />
          </Suspense>
        )
      case 'details':
        return (
          <Suspense fallback={<SkeletonLoader count={4} height="40px" />}>
            <Details />
          </Suspense>
        )
      default:
        return <Standings />
    }
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
        <h1 className="responsive-heading text-[--ink-900]">
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
        role="tablist"
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
              font-medium
              rounded-t-[--r-md]
              transition-all
              duration-[--duration-normal]
              whitespace-nowrap
              responsive-tab-label
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
            role="tab"
            aria-selected={currentTab === tab.id}
            aria-controls={`tab-${tab.id}`}
          >
            <span className="text-lg" aria-hidden="true">{tab.icon}</span>
            <span className="responsive-hidden-mobile">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Error Banner with Auto-Retry */}
      {error && (
        <div role="alert" className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] flex items-center justify-between gap-[--s-4]">
          <div>
            <p className="font-medium text-[--rose-800]">Failed to load tournament data</p>
            <p className="text-sm text-[--rose-700] mt-[--s-1]">{error.message}</p>
            {retryIn !== null && (
              <p className="text-xs text-[--rose-600] mt-[--s-1]">Auto-retry in {retryIn}s</p>
            )}
          </div>
          <div className="flex gap-[--s-2] flex-shrink-0">
            {retryIn !== null && (
              <button
                onClick={cancelAutoRetry}
                className="text-sm text-[--rose-700] hover:text-[--rose-900]"
              >
                Cancel
              </button>
            )}
            <button
              onClick={refetch}
              className="text-sm font-medium text-[--rose-700] underline hover:text-[--rose-900]"
            >
              Retry now
            </button>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div
        id={`tab-${currentTab}`}
        className={`
          rounded-[--r-lg]
          border
          border-[--border]
          p-[--s-6]
          min-h-[400px]
          bg-white
        `}
        role="tabpanel"
      >
        {sseState.error && (
          <div className="bg-[--rose-50] border border-[--rose-200] rounded-[--r-lg] p-[--s-4] text-[--rose-800] mb-[--s-4]">
            <p className="text-sm">SSE Connection Error: {sseState.error}</p>
          </div>
        )}
        {renderTabContent()}
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
          <p>SSE Connected: {sseState.connected ? 'yes' : 'no'}</p>
          <p>SSE Reconnecting: {sseState.reconnecting ? 'yes' : 'no'}</p>
        </div>
      )}
    </div>
  )
}
