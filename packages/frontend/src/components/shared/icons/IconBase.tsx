import React from 'react'

export interface IconProps {
  size?: number
  color?: string
  className?: string
}

interface IconBaseProps extends IconProps {
  children: React.ReactNode
}

/**
 * Shared wrapper for the hand-rolled nav/menu icon set (ISSUE-27) — 24x24
 * stroke grammar matching Feather/Lucide's visual style, `currentColor` so
 * a nav item's existing active/inactive `color` CSS drives the icon for
 * free (emoji could not respond to that at all).
 */
export const IconBase: React.FC<IconBaseProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  children,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
)
