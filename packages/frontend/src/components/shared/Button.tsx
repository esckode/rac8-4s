/**
 * Button - Primary interactive component
 *
 * Supports variants (primary, secondary, outline, ghost, soft, dark),
 * sizes (sm, md, lg), and states (hover, focus, active, disabled, loading).
 * Mobile: 44px minimum touch target on small screens.
 */

import React from 'react'
import '../../styles/globals.css'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className, style, children, ...props }, ref) => {
    const variantClasses = {
      primary: 'text-white',
      secondary: 'text-white',
      outline: 'bg-transparent border-2 text-[--court-600] hover:bg-[--court-50] active:bg-[--court-100]',
      ghost: 'bg-transparent text-[--ink-600] hover:bg-[--ink-50] active:bg-[--ink-100]',
      soft: 'text-[--court-700] hover:bg-[--court-200] active:bg-[--court-300]',
      dark: 'text-white hover:bg-[--ink-800] active:bg-[--ink-700]',
    }

    const variantStyles = {
      primary: { backgroundColor: 'var(--court-400)' },
      secondary: { backgroundColor: 'var(--lavender-400)' },
      outline: { borderColor: 'var(--court-400)' },
      ghost: {},
      soft: { backgroundColor: 'var(--court-100)' },
      dark: { backgroundColor: 'var(--ink-900)' },
    }

    const sizeClasses = {
      sm: 'px-[--s-3] py-[--s-2] text-sm rounded-[--r-sm] min-h-[36px]',
      md: 'px-[--s-4] py-[--s-3] text-base rounded-[--r-md] min-h-[44px]',
      lg: 'px-[--s-6] py-[--s-4] text-base rounded-[--r-lg] min-h-[48px]',
    }

    const disabledClasses = disabled || loading ? 'opacity-60 cursor-not-allowed' : ''
    const focusClasses = 'focus:outline-none focus:ring-4 focus:ring-[--court-400] focus:ring-opacity-30'
    const transitionClasses = 'transition-all duration-[--duration-normal] ease-[--easing-snap]'

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          font-medium
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${disabledClasses}
          ${focusClasses}
          ${transitionClasses}
          ${className}
        `}
        style={{
          ...variantStyles[variant],
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <span className="inline-flex items-center gap-[--s-2]">
            <svg
              className="animate-spin h-4 w-4"
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
            {children}
          </span>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
