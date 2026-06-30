/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState.tsx', () => {
  describe('Rendering', () => {
    it('renders with required title', () => {
      render(<EmptyState title="No results found" />)
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('renders with optional description', () => {
      render(<EmptyState title="No results" description="Try adjusting your search filters" />)
      expect(screen.getByText('Try adjusting your search filters')).toBeInTheDocument()
    })

    it('renders without description when not provided', () => {
      render(<EmptyState title="No results" />)
      expect(screen.queryByRole('paragraph')).not.toBeInTheDocument()
    })

    it('renders action button when action prop provided', () => {
      render(<EmptyState title="No groups" action={{ label: 'Create Group', onClick: jest.fn() }} />)
      expect(screen.getByRole('button', { name: /create group/i })).toBeInTheDocument()
    })

    it('does not render action button when action not provided', () => {
      render(<EmptyState title="No groups" />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('has data-testid attribute', () => {
      render(<EmptyState title="No results" />)
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  describe('Action callback', () => {
    it('calls action onClick when button is clicked', () => {
      const onClick = jest.fn()
      render(<EmptyState title="No groups" action={{ label: 'Create Group', onClick }} />)
      fireEvent.click(screen.getByRole('button', { name: /create group/i }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('Design token compliance', () => {
    it('uses no hex color literals', () => {
      const { container } = render(<EmptyState title="No results" />)
      const html = container.innerHTML
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    })

    it('uses no rgb/rgba color literals', () => {
      const { container } = render(<EmptyState title="No results" />)
      const html = container.innerHTML
      expect(html).not.toMatch(/rgba?\(/)
    })
  })
})
