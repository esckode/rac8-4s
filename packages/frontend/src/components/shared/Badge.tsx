/**
 * Badge - Compact phase/status indicator component
 *
 * Supports variants: group, knockout, live.
 * Uses pastel colors from design tokens.
 */

import React from 'react'
import '../../../styles/globals.css'

export interface BadgeProps {
  variant: 'group' | 'knockout' | 'live' | 'registration' | 'complete'
  children: React.ReactNode
  className?: string
}

export const Badge: React.FC<BadgeProps> = ({ variant, children, className }) => {
  const variantClasses = {
    group: 'bg-[--court-100] text-[--court-700]',
    knockout: 'bg-[--lavender-100] text-[--lavender-700]',
    live: 'bg-[--mint-100] text-[--mint-600]',
    registration: 'bg-[--peach-100] text-[--peach-600]',
    complete: 'bg-[--gold-200] text-[--gold-600]',
  }

  return (
    <span
      className={`
        inline-flex
        items-center
        px-[--s-3]
        py-[--s-1]
        text-xs
        font-semibold
        rounded-[--r-full]
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {children}
    </span>
  )
}
