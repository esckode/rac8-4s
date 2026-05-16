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
      {/* Outer crescent using circle + rect mask effect */}
      <defs>
        <mask id="crescent-mask">
          <rect width="88" height="88" fill="white" />
          <circle cx="48" cy="44" r="38" fill="black" />
        </mask>
      </defs>

      {/* Outer crescent */}
      <circle cx="44" cy="44" r="42" fill={color} mask="url(#crescent-mask)" />

      {/* Inner crescent */}
      <circle cx="50" cy="44" r="28" fill={accent} opacity="0.85" mask="url(#crescent-mask)" />
    </svg>
  )
}

LogoMark.displayName = 'LogoMark'
