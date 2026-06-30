/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorState } from '../ErrorState'

describe('ErrorState.tsx', () => {
  describe('Rendering', () => {
    it('renders with required message', () => {
      render(<ErrorState message="Something went wrong" />)
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    })

    it('renders retry button when onRetry provided', () => {
      render(<ErrorState message="Failed to load" onRetry={jest.fn()} />)
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })

    it('does not render retry button when onRetry not provided', () => {
      render(<ErrorState message="Failed to load" />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('has data-testid attribute', () => {
      render(<ErrorState message="Error occurred" />)
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })

    it('renders an error icon', () => {
      const { container } = render(<ErrorState message="Error" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('Retry callback', () => {
    it('calls onRetry when retry button is clicked', () => {
      const onRetry = jest.fn()
      render(<ErrorState message="Failed to load" onRetry={onRetry} />)
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })
  })

  describe('Design token compliance', () => {
    it('uses no hex color literals', () => {
      const { container } = render(<ErrorState message="Error" onRetry={jest.fn()} />)
      const html = container.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    })

    it('uses no rgb/rgba color literals', () => {
      const { container } = render(<ErrorState message="Error" onRetry={jest.fn()} />)
      const html = container.innerHTML
      expect(html).not.toMatch(/rgba?\(/)
    })
  })
})
