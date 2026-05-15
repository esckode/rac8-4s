/**
 * LoadingSpinner - Animated loading indicator
 *
 * Supports size prop and optional label text.
 * Uses smooth animation with design token durations.
 */

import React from 'react'
import '../../../styles/tokens.css'

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  className?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', label, className }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  }

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-[--s-3] ${className}`}>
      <svg
        className={`${sizeClasses[size]} animate-spin text-[--court-400]`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label && <p className={`text-[--ink-600] font-medium ${labelSizeClasses[size]}`}>{label}</p>}
    </div>
  )
}
