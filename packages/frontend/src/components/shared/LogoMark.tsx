import React from 'react'

export interface LogoMarkProps {
  size?: number
  color?: string
  accent?: string
  className?: string
}

export const LogoMark: React.FC<LogoMarkProps> = ({
  size = 88,
  color = 'var(--court-400)',
  accent = 'var(--court-500)',
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      fill="none"
      className={className}
    >
      <defs>
        <mask id={`crescent-outer-${size}`}>
          <rect width="88" height="88" fill="white" />
          <circle cx="60" cy="44" r="44" fill="black" />
        </mask>
        <mask id={`crescent-inner-${size}`}>
          <rect width="88" height="88" fill="white" />
          <circle cx="56" cy="44" r="32" fill="black" />
        </mask>
      </defs>

      {/* Outer crescent - more pronounced C-curve */}
      <circle cx="24" cy="44" r="44" fill={color} mask={`url(#crescent-outer-${size})`} />

      {/* Inner crescent - smaller C-curve offset */}
      <circle cx="28" cy="44" r="32" fill={accent} opacity="0.85" mask={`url(#crescent-inner-${size})`} />
    </svg>
  )
}

LogoMark.displayName = 'LogoMark'
