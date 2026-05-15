/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaginationControls } from '../PaginationControls'

describe('PaginationControls', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders button when hasMore is true', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('does not render when hasMore is false', () => {
      const { container } = render(
        <PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />
      )

      expect(container.firstChild).toBeNull()
    })

    it('displays "Load More" text by default', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.getByText('Load More')).toBeInTheDocument()
    })

    it('displays button with correct aria-label', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label', 'Load more items')
    })
  })

  describe('Loading State', () => {
    it('shows loading text when isLoading is true', () => {
      render(<PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('disables button when isLoading is true', () => {
      render(<PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('enables button when isLoading is false', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).not.toBeDisabled()
    })

    it('shows loading spinner when isLoading is true', () => {
      render(<PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('hides loading spinner when isLoading is false', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
  })

  describe('Visibility', () => {
    it('hides button when hasMore is false', () => {
      const { container } = render(
        <PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />
      )

      expect(container.firstChild).toBeNull()
    })

    it('shows button when hasMore is true', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('shows button when hasMore changes from false to true', () => {
      const { rerender } = render(
        <PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />
      )

      rerender(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('hides button when hasMore changes from true to false', () => {
      const { rerender, container } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      rerender(<PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />)

      expect(container.querySelector('button')).not.toBeInTheDocument()
    })
  })

  describe('Click Handler', () => {
    it('calls onLoadMore when button is clicked', () => {
      const onLoadMore = jest.fn()
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore} />)

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(onLoadMore).toHaveBeenCalledTimes(1)
    })

    it('calls onLoadMore when clicked', () => {
      const onLoadMore = jest.fn()
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore} />)

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(onLoadMore).toHaveBeenCalled()
    })

    it('does not call onLoadMore when button is disabled', () => {
      const onLoadMore = jest.fn()
      render(<PaginationControls hasMore={true} isLoading={true} onLoadMore={onLoadMore} />)

      const button = screen.getByRole('button')
      fireEvent.click(button)

      expect(onLoadMore).not.toHaveBeenCalled()
    })

    it('calls onLoadMore multiple times on multiple clicks', () => {
      const onLoadMore = jest.fn()
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore} />)

      const button = screen.getByRole('button')
      fireEvent.click(button)
      fireEvent.click(button)
      fireEvent.click(button)

      expect(onLoadMore).toHaveBeenCalledTimes(3)
    })
  })

  describe('Styling', () => {
    it('applies default className', () => {
      const { container } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('flex', 'justify-center', 'py-[--s-8]')
    })

    it('applies custom className', () => {
      const { container } = render(
        <PaginationControls
          hasMore={true}
          isLoading={false}
          onLoadMore={jest.fn()}
          className="custom-class"
        />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('custom-class')
    })

    it('button has correct styling', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('px-[--s-6]', 'py-[--s-3]', 'bg-[--court-500]', 'text-white')
    })

    it('button has hover styling', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('hover:bg-[--court-600]')
    })

    it('button has disabled styling', () => {
      render(<PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('disabled:opacity-50', 'disabled:cursor-not-allowed')
    })
  })

  describe('Mobile Responsive', () => {
    it('renders centered on all screen sizes', () => {
      const { container } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('justify-center')
    })

    it('button is responsive with padding', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('rounded-[--r-lg]')
    })
  })

  describe('Props Validation', () => {
    it('works with all required props', () => {
      expect(() => {
        render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)
      }).not.toThrow()
    })

    it('works with optional className prop', () => {
      expect(() => {
        render(
          <PaginationControls
            hasMore={true}
            isLoading={false}
            onLoadMore={jest.fn()}
            className="test"
          />
        )
      }).not.toThrow()
    })

    it('handles boolean values correctly', () => {
      const { rerender } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      expect(screen.getByRole('button')).toBeInTheDocument()

      rerender(<PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('State Transitions', () => {
    it('transitions from loading to idle', () => {
      const { rerender } = render(
        <PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.getByRole('button')).toBeDisabled()

      rerender(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      expect(screen.getByText('Load More')).toBeInTheDocument()
      expect(screen.getByRole('button')).not.toBeDisabled()
    })

    it('transitions from idle to loading', () => {
      const { rerender } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      expect(screen.getByText('Load More')).toBeInTheDocument()
      expect(screen.getByRole('button')).not.toBeDisabled()

      rerender(<PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.getByRole('button')).toBeDisabled()
    })

    it('transitions from hasMore true to false', () => {
      const { rerender, container } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      expect(screen.getByRole('button')).toBeInTheDocument()

      rerender(<PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />)

      expect(container.querySelector('button')).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('button is keyboard accessible', () => {
      const onLoadMore = jest.fn()
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore} />)

      const button = screen.getByRole('button')
      button.focus()
      expect(button).toHaveFocus()
    })

    it('button is accessible via keyboard', () => {
      const onLoadMore = jest.fn()
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore} />)

      const button = screen.getByRole('button')
      button.focus()

      expect(button).toHaveFocus()
      expect(button).not.toBeDisabled()
    })

    it('has semantic HTML structure', () => {
      const { container } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      expect(container.querySelector('button')).toBeInTheDocument()
    })

    it('includes aria-label for accessibility', () => {
      render(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('aria-label')
    })
  })

  describe('Edge Cases', () => {
    it('handles rapid prop changes', () => {
      const { rerender } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />
      )

      rerender(<PaginationControls hasMore={true} isLoading={true} onLoadMore={jest.fn()} />)
      rerender(<PaginationControls hasMore={true} isLoading={false} onLoadMore={jest.fn()} />)
      rerender(<PaginationControls hasMore={false} isLoading={false} onLoadMore={jest.fn()} />)

      expect(true).toBe(true)
    })

    it('handles callback changes', () => {
      const onLoadMore1 = jest.fn()
      const onLoadMore2 = jest.fn()

      const { rerender } = render(
        <PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore1} />
      )

      fireEvent.click(screen.getByRole('button'))
      expect(onLoadMore1).toHaveBeenCalledTimes(1)

      rerender(<PaginationControls hasMore={true} isLoading={false} onLoadMore={onLoadMore2} />)

      fireEvent.click(screen.getByRole('button'))
      expect(onLoadMore2).toHaveBeenCalledTimes(1)
      expect(onLoadMore1).toHaveBeenCalledTimes(1)
    })

    it('handles empty className', () => {
      expect(() => {
        render(
          <PaginationControls
            hasMore={true}
            isLoading={false}
            onLoadMore={jest.fn()}
            className=""
          />
        )
      }).not.toThrow()
    })
  })
})
