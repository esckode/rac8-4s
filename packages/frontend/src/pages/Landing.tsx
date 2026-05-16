import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/shared/Button'
import { Logo } from '../components/shared/Logo'
import { LogoMark } from '../components/shared/LogoMark'
import '../styles/globals.css'

export const Landing: React.FC = () => {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()

  return (
    <>
      {/* Mobile Landing - Dark Theme */}
      <div className="md:hidden min-h-screen flex flex-col bg-gradient-to-b from-[#1F2D4E] to-[#0F1B2E] relative overflow-hidden">
        {/* Decorative SVG circles */}
        <div className="absolute inset-0 opacity-[0.18] pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
            <circle cx="320" cy="120" r="180" fill="#7BC3FF" opacity="0.5" />
            <circle cx="60" cy="500" r="200" fill="#A98AE0" opacity="0.4" />
          </svg>
        </div>

        {/* Status Bar */}
        <div className="h-11 px-6 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-bold text-white">9:41</span>
          <div className="flex items-center gap-1">
            <svg width="16" height="10" viewBox="0 0 16 10">
              <path d="M0 8h2v2H0zM4 6h2v4H4zM8 3h2v7H8zM12 0h2v10h-2z" fill="white" />
            </svg>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
              <path d="M1 4a8 8 0 0 1 12 0M3 6a5 5 0 0 1 8 0M5 8a2 2 0 0 1 4 0" stroke="white" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <svg width="22" height="10" viewBox="0 0 22 10">
              <rect x="0.5" y="0.5" width="18" height="9" rx="2" fill="none" stroke="white" strokeOpacity="0.5" />
              <rect x="2" y="2" width="14" height="6" rx="1" fill="white" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="relative flex-1 px-7 flex flex-col justify-between">
          <div className="pt-8">
            <Logo size={20} tone="light" />
          </div>

          <div>
            {/* Logo Mark */}
            <div className="mb-7">
              <LogoMark size={88} color="#A8D5FF" accent="#7BC3FF" />
            </div>

            {/* Heading */}
            <h1 className="text-[2.75rem] font-bold text-white leading-[1.05] mb-4">
              See you at the court.
            </h1>

            {/* Subtitle */}
            <p className="text-base text-white/72 leading-relaxed max-w-xs mb-8">
              Find drop-in nights, join your club's leagues, and run friendly tournaments — all on the sideline.
            </p>
          </div>

          {/* Buttons */}
          <div className="pb-9 flex flex-col gap-3">
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => navigate('/tournaments')}
            >
              Continue with email
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full bg-white/8 text-white border border-white/18 hover:bg-white/12"
              onClick={() => navigate('/browse')}
            >
              Browse tournaments
            </Button>
            <p className="text-center text-xs text-white/50 mt-1.5">
              New here? An account creates itself when you join your first night.
            </p>
          </div>
        </div>
      </div>

      {/* Desktop Landing - Light Theme */}
      <div className="hidden md:flex flex-col min-h-screen bg-gradient-to-br from-[--court-50] to-[--lavender-50]">

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
              onClick={() => navigate('/browse')}
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
                onClick={() => navigate('/tournaments')}
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
          <p>© 2026 U At Court. All rights reserved.</p>
        </footer>
      </div>
    </>
  )
}
