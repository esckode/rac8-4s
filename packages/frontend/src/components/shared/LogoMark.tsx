import React from 'react'

export interface LogoMarkProps {
  size?: number
  color?: string
  accent?: string
  className?: string
}

export const LogoMark: React.FC<LogoMarkProps> = ({
  size = 56,
  color = 'var(--court-400)',
  accent,
  className = '',
}) => {
  const accentColor = accent || color

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
    >
      {/* Outer crescent — large C opening to the right */}
      <path
        d="M 50 6
           A 44 44 0 1 0 50 94
           A 32 32 0 1 1 50 18
           Z"
        fill={color}
      />
      {/* Inner crescent — smaller C, slightly offset */}
      <path
        d="M 50 24
           A 26 26 0 1 0 50 76
           A 14 14 0 1 1 50 32
           Z"
        fill={accentColor}
        opacity="0.85"
      />
    </svg>
  )
}

LogoMark.displayName = 'LogoMark'
