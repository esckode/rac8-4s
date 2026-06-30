/**
 * ErrorState - Full-area error display with optional retry
 *
 * Displayed when a data load fails. Accepts an optional onRetry callback
 * to allow the user to re-attempt the operation.
 */

import React from 'react'
import { Button } from './Button'
import '../../styles/globals.css'

export interface ErrorStateProps {
  message: string
  onRetry?: () => void
  className?: string
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry, className }) => {
  return (
    <div
      data-testid="error-state"
      className={`flex flex-col items-center justify-center gap-[--s-4] py-[--s-12] px-[--s-6] text-center ${className ?? ''}`}
    >
      <svg
        className="w-12 h-12 text-[--rose-400]"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
        />
      </svg>
      <p className="text-sm font-medium text-[--ink-700]">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

ErrorState.displayName = 'ErrorState'
