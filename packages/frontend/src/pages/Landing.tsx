import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import '../../styles/globals.css'

export const Landing: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  return (
    <div
      className={`
        min-h-screen
        flex
        flex-col
        bg-gradient-to-br
        from-[--court-50]
        to-[--lavender-50]
      `}
    >
      {/* Header */}
      <header
        className={`
          flex
          items-center
          justify-between
          px-[--s-4]
          sm:px-[--s-8]
          py-[--s-4]
          border-b
          border-[--border]
          bg-white
        `}
      >
        <h1 className="text-xl sm:text-2xl font-bold text-[--court-600]">
          🏸 Doubles Pickleball Cup
        </h1>
        <div className="flex gap-[--s-3]">
          {isAuthenticated && user ? (
            <>
              <span className="text-sm text-[--ink-600]">{user.email}</span>
              <button
                onClick={() => {
                  localStorage.removeItem('auth_token')
                  window.location.reload()
                }}
                className={`
                  px-[--s-3]
                  py-[--s-2]
                  text-xs
                  sm:text-sm
                  font-medium
                  text-[--ink-600]
                  hover:text-[--ink-900]
                  border
                  border-[--border]
                  rounded-[--r-md]
                  transition-colors
                  duration-[--duration-normal]
                  focus:outline-none
                  focus:ring-2
                  focus:ring-[--court-400]
                  focus:ring-offset-2
                `}
              >
                Logout
              </button>
            </>
          ) : (
            <button
              className={`
                px-[--s-3]
                py-[--s-2]
                text-xs
                sm:text-sm
                font-medium
                text-white
                bg-[--court-500]
                rounded-[--r-md]
                hover:bg-[--court-600]
                transition-colors
                duration-[--duration-normal]
                focus:outline-none
                focus:ring-2
                focus:ring-[--court-400]
                focus:ring-offset-2
              `}
            >
              Login
            </button>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main
        className={`
          flex-1
          flex
          flex-col
          items-center
          justify-center
          px-[--s-4]
          sm:px-[--s-6]
          py-[--s-8]
          sm:py-[--s-12]
          gap-[--s-8]
        `}
      >
        <div className="text-center space-y-[--s-4] max-w-2xl">
          <h2 className="text-4xl sm:text-5xl font-bold text-[--ink-900] leading-tight">
            Tournament Management Made Simple
          </h2>
          <p className="text-lg sm:text-xl text-[--ink-600]">
            Organize pickleball tournaments, manage brackets, track standings, and coordinate matches effortlessly.
          </p>
        </div>

        {/* Action Buttons */}
        <div
          className={`
            flex
            flex-col
            sm:flex-row
            gap-[--s-4]
            w-full
            max-w-md
          `}
        >
          <button
            onClick={() => navigate('/standings')}
            className={`
              flex-1
              px-[--s-6]
              py-[--s-4]
              bg-[--court-500]
              text-white
              rounded-[--r-lg]
              font-bold
              text-base
              sm:text-lg
              transition-all
              duration-[--duration-normal]
              hover:bg-[--court-600]
              hover:shadow-lg
              active:scale-95
              focus:outline-none
              focus:ring-2
              focus:ring-[--court-400]
              focus:ring-offset-2
            `}
          >
            Browse Tournaments
          </button>

          {isAuthenticated && (
            <button
              onClick={() => navigate('/matches')}
              className={`
                flex-1
                px-[--s-6]
                py-[--s-4]
                bg-[--lavender-500]
                text-white
                rounded-[--r-lg]
                font-bold
                text-base
                sm:text-lg
                transition-all
                duration-[--duration-normal]
                hover:bg-[--lavender-600]
                hover:shadow-lg
                active:scale-95
                focus:outline-none
                focus:ring-2
                focus:ring-[--court-400]
                focus:ring-offset-2
              `}
            >
              My Tournaments
            </button>
          )}
        </div>

        {/* Feature Highlights */}
        <div
          className={`
            grid
            grid-cols-1
            sm:grid-cols-3
            gap-[--s-4]
            w-full
            max-w-3xl
            mt-[--s-8]
          `}
        >
          <div
            className={`
              bg-white
              rounded-[--r-lg]
              p-[--s-4]
              sm:p-[--s-6]
              border
              border-[--border]
              shadow-sm
              space-y-[--s-2]
            `}
          >
            <div className="text-3xl">📊</div>
            <h3 className="font-bold text-[--ink-900]">Live Standings</h3>
            <p className="text-sm text-[--ink-600]">
              Real-time standings and player rankings
            </p>
          </div>

          <div
            className={`
              bg-white
              rounded-[--r-lg]
              p-[--s-4]
              sm:p-[--s-6]
              border
              border-[--border]
              shadow-sm
              space-y-[--s-2]
            `}
          >
            <div className="text-3xl">🏆</div>
            <h3 className="font-bold text-[--ink-900]">Bracket View</h3>
            <p className="text-sm text-[--ink-600]">
              Clear knockout bracket visualization
            </p>
          </div>

          <div
            className={`
              bg-white
              rounded-[--r-lg]
              p-[--s-4]
              sm:p-[--s-6]
              border
              border-[--border]
              shadow-sm
              space-y-[--s-2]
            `}
          >
            <div className="text-3xl">🎾</div>
            <h3 className="font-bold text-[--ink-900]">Match Info</h3>
            <p className="text-sm text-[--ink-600]">
              Easy match scheduling and score tracking
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        className={`
          text-center
          py-[--s-4]
          border-t
          border-[--border]
          bg-white
          text-sm
          text-[--ink-600]
        `}
      >
        <p>© 2026 Doubles Pickleball Cup. All rights reserved.</p>
      </footer>
    </div>
  )
}
