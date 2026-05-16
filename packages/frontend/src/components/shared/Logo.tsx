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
  // tone: navy (dark on light), light (light on dark), mono-court
  const ink = tone === 'light' ? '#FFFFFF' : 'var(--ink-900)'
  const mark1 = tone === 'light' ? '#A8D5FF' : 'var(--court-400)'
  const mark2 = tone === 'light' ? '#7BC3FF' : 'var(--court-500)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.35,
      }}
      className={className}
    >
      <LogoMark size={size * 1.5} color={mark1} accent={mark2} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: size,
            color: ink,
            letterSpacing: '-0.02em',
          }}
        >
          U At Court
        </div>
        {tagline && (
          <div
            style={{
              fontSize: size * 0.42,
              marginTop: size * 0.18,
              color:
                tone === 'light'
                  ? 'rgba(255,255,255,0.7)'
                  : 'var(--ink-500)',
              fontWeight: 500,
              letterSpacing: '0.02em',
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
