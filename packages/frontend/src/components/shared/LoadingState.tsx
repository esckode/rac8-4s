/**
 * LoadingState - Full-area loading placeholder
 *
 * Displayed while data is being fetched.
 * Wraps LoadingSpinner with optional descriptive message.
 */

import React from 'react'
import { LoadingSpinner } from './LoadingSpinner'
import '../../styles/globals.css'

export interface LoadingStateProps {
  message?: string
  className?: string
}

export const LoadingState: React.FC<LoadingStateProps> = ({ message, className }) => {
  return (
    <div
      data-testid="loading-state"
      className={`flex flex-col items-center justify-center gap-[--s-4] py-[--s-12] px-[--s-6] ${className ?? ''}`}
    >
      <LoadingSpinner size="md" />
      {message && <p className="text-sm text-[--ink-500]">{message}</p>}
    </div>
  )
}

LoadingState.displayName = 'LoadingState'
