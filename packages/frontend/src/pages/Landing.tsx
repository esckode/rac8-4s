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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, #1F2D4E 0%, #0F1B2E 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative SVG circles */}
        <div className="absolute inset-0 opacity-[0.18] pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
            <circle cx="320" cy="120" r="180" fill="#7BC3FF" opacity="0.5" />
            <circle cx="60" cy="500" r="200" fill="#A98AE0" opacity="0.4" />
          </svg>
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
              onClick={() => navigate('/login')}
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
