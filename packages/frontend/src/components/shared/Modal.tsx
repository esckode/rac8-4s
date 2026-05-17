import React, { useEffect, useRef } from 'react'
import { Button } from './Button'
import '../../styles/globals.css'

export interface ModalAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'soft' | 'dark'
}

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  actions?: ModalAction[]
  className?: string
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  className,
}) => {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className={`
        fixed
        inset-0
        z-50
        flex
        items-center
        justify-center
        bg-black/40
        transition-opacity
        duration-[--duration-normal]
      `}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`
          bg-white
          rounded-[--r-lg]
          shadow-lg
          max-w-[90vw]
          sm:max-w-md
          max-h-[90vh]
          overflow-hidden
          flex
          flex-col
          transition-all
          duration-[--duration-normal]
          ${className}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[--s-4] py-[--s-4] border-b border-[--border]">
          <h2
            id="modal-title"
            className="text-lg font-bold text-[--ink-900]"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className={`
              flex
              items-center
              justify-center
              w-8
              h-8
              rounded-[--r-md]
              text-[--ink-600]
              hover:text-[--ink-900]
              hover:bg-[--ink-100]
              transition-colors
              duration-[--duration-normal]
              focus:outline-none
              focus:ring-2
              focus:ring-[--court-400]
              focus:ring-offset-2
            `}
          >
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-[--s-4] py-[--s-4]">
          {children}
        </div>

        {/* Actions */}
        {actions && actions.length > 0 && (
          <div className="flex gap-[--s-2] px-[--s-4] py-[--s-4] border-t border-[--border]">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'secondary'}
                size="md"
                onClick={action.onClick}
                className="flex-1"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
