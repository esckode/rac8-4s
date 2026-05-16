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
      {/* Landing - Dark Theme */}
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#1F2D4E] to-[#0F1B2E] relative overflow-hidden">
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
    </>
  )
}
