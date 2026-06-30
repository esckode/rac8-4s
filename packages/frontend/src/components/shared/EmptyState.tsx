/**
 * EmptyState - Zero-content placeholder with optional action
 *
 * Displayed when a list or section has no data to show.
 * Supports an optional description and action button.
 */

import React from 'react'
import { Button } from './Button'
import '../../styles/globals.css'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, className }) => {
  return (
    <div
      data-testid="empty-state"
      className={`flex flex-col items-center justify-center gap-[--s-4] py-[--s-12] px-[--s-6] text-center ${className ?? ''}`}
    >
      <svg
        className="w-12 h-12 text-[--ink-300]"
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
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      <div className="flex flex-col gap-[--s-2]">
        <h3 className="text-base font-semibold text-[--ink-900]">{title}</h3>
        {description && <p className="text-sm text-[--ink-500]">{description}</p>}
      </div>
      {action && (
        <Button variant="primary" size="md" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

EmptyState.displayName = 'EmptyState'
