/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ReconnectingIndicator } from '../ReconnectingIndicator'

describe('ReconnectingIndicator.tsx', () => {
  describe('Rendering', () => {
    it('renders when visible is true (default)', () => {
      render(<ReconnectingIndicator />)
      expect(screen.getByTestId('reconnecting-indicator')).toBeInTheDocument()
    })

    it('renders reconnecting text', () => {
      render(<ReconnectingIndicator />)
      expect(screen.getByText(/reconnecting/i)).toBeInTheDocument()
    })

    it('is hidden when visible is false', () => {
      render(<ReconnectingIndicator visible={false} />)
      expect(screen.queryByTestId('reconnecting-indicator')).not.toBeInTheDocument()
    })

    it('has data-testid attribute', () => {
      render(<ReconnectingIndicator />)
      expect(screen.getByTestId('reconnecting-indicator')).toBeInTheDocument()
    })

    it('renders an animated indicator', () => {
      const { container } = render(<ReconnectingIndicator />)
      const animated = container.querySelector('.animate-spin, .animate-pulse')
      expect(animated).toBeInTheDocument()
    })
  })

  describe('Design token compliance', () => {
    it('uses no hex color literals', () => {
      const { container } = render(<ReconnectingIndicator />)
      const html = container.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    })

    it('uses no rgb/rgba color literals', () => {
      const { container } = render(<ReconnectingIndicator />)
      const html = container.innerHTML
      expect(html).not.toMatch(/rgba?\(/)
    })
  })
})
