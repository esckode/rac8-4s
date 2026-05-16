import React from 'react'
import { LogoMark } from './LogoMark'

export interface LogoProps {
  size?: number
  tone?: 'navy' | 'light' | 'mono-court'
  tagline?: boolean
  className?: string
}

export const Logo: React.FC<LogoProps> = ({
  size = 28,
  tone = 'navy',
  tagline = false,
  className = '',
}) => {
  const textColor = tone === 'light' ? '#FFFFFF' : 'var(--ink-900)'
  const markSize = size * 1.5

  return (
    <div className={`flex items-center gap-[${size * 0.35}px] ${className}`} style={{ gap: `${size * 0.35}px` }}>
      {/* Logo mark */}
      <LogoMark size={markSize} />

      {/* Brand text and optional tagline */}
      <div className="flex flex-col">
        <div
          style={{
            fontSize: `${size}px`,
            fontWeight: 700,
            color: textColor,
            lineHeight: 1,
            letterSpacing: '-0.01em',
          }}
        >
          U At Court
        </div>
        {tagline && (
          <div
            style={{
              fontSize: `${size * 0.42}px`,
              fontWeight: 500,
              color: textColor,
              opacity: 0.7,
              lineHeight: 1.2,
            }}
          >
            Make Your Play Count
          </div>
        )}
      </div>
    </div>
  )
}

Logo.displayName = 'Logo'
