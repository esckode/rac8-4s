/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { LoadingState } from '../LoadingState'

describe('LoadingState.tsx', () => {
  describe('Rendering', () => {
    it('renders without props', () => {
      render(<LoadingState />)
      expect(screen.getByTestId('loading-state')).toBeInTheDocument()
    })

    it('renders with optional message', () => {
      render(<LoadingState message="Loading players..." />)
      expect(screen.getByText('Loading players...')).toBeInTheDocument()
    })

    it('renders without message when not provided', () => {
      const { container } = render(<LoadingState />)
      const text = container.querySelector('p')
      expect(text).not.toBeInTheDocument()
    })

    it('renders a loading spinner svg', () => {
      const { container } = render(<LoadingState />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('has data-testid attribute', () => {
      render(<LoadingState />)
      expect(screen.getByTestId('loading-state')).toBeInTheDocument()
    })
  })

  describe('Design token compliance', () => {
    it('uses no hex color literals', () => {
      const { container } = render(<LoadingState message="Loading..." />)
      const html = container.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    })

    it('uses no rgb/rgba color literals', () => {
      const { container } = render(<LoadingState message="Loading..." />)
      const html = container.innerHTML
      expect(html).not.toMatch(/rgba?\(/)
    })
  })
})
