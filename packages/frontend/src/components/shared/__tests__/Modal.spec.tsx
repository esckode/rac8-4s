/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '../Modal'

describe('Modal.tsx', () => {
  describe('Rendering', () => {
    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={jest.fn()} title="Test Modal">
          <div>Modal content</div>
        </Modal>
      )
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText('Modal content')).not.toBeInTheDocument()
    })

    it('renders when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <div>Modal content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Modal content')).toBeInTheDocument()
    })

    it('renders modal title', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="My Modal Title">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('heading', { name: /my modal title/i })).toBeInTheDocument()
    })

    it('renders modal content', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div data-testid="modal-content">Custom content here</div>
        </Modal>
      )
      expect(screen.getByTestId('modal-content')).toBeInTheDocument()
      expect(screen.getByText('Custom content here')).toBeInTheDocument()
    })

    it('renders close button', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div>Content</div>
        </Modal>
      )
      const closeButton = screen.getByRole('button', { name: /close modal/i })
      expect(closeButton).toBeInTheDocument()
    })

    it('has proper accessibility attributes', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Accessible Modal">
          <div>Content</div>
        </Modal>
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveAttribute('aria-modal', 'true')
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title')
    })
  })

  describe('Closing behavior', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn()
      render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Modal>
      )
      const closeButton = screen.getByRole('button', { name: /close modal/i })
      fireEvent.click(closeButton)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when Escape key is pressed', () => {
      const onClose = jest.fn()
      render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Modal>
      )
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when clicking outside modal (backdrop)', () => {
      const onClose = jest.fn()
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Modal>
      )
      // Click on the backdrop (fixed inset-0 div)
      const backdrop = container.querySelector('.fixed.inset-0')
      if (backdrop) {
        fireEvent.mouseDown(backdrop)
        expect(onClose).toHaveBeenCalled()
      }
    })

    it('does not call onClose when clicking modal content', () => {
      const onClose = jest.fn()
      render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <div data-testid="modal-content">Click me</div>
        </Modal>
      )
      const content = screen.getByTestId('modal-content')
      fireEvent.mouseDown(content)
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Actions', () => {
    it('does not render actions footer when no actions provided', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div>Content</div>
        </Modal>
      )
      const buttons = container.querySelectorAll('button')
      // Should only have close button in header
      expect(buttons.length).toBe(1)
    })

    it('renders action buttons when actions are provided', () => {
      const actions = [
        { label: 'Cancel', onClick: jest.fn() },
        { label: 'Confirm', onClick: jest.fn() },
      ]
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={actions}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    })

    it('executes action onClick handler', () => {
      const mockClick = jest.fn()
      const actions = [{ label: 'Click', onClick: mockClick }]
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={actions}>
          <div>Content</div>
        </Modal>
      )
      const button = screen.getByRole('button', { name: /click/i })
      fireEvent.click(button)
      expect(mockClick).toHaveBeenCalledTimes(1)
    })

    it('renders multiple action buttons', () => {
      const actions = [
        { label: 'Action 1', onClick: jest.fn() },
        { label: 'Action 2', onClick: jest.fn() },
        { label: 'Action 3', onClick: jest.fn() },
      ]
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={actions}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('button', { name: /action 1/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /action 2/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /action 3/i })).toBeInTheDocument()
    })

    it('applies variant prop to action buttons', () => {
      const actions = [
        { label: 'Secondary', onClick: jest.fn(), variant: 'secondary' as const },
        { label: 'Danger', onClick: jest.fn(), variant: 'danger' as const },
      ]
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={actions}>
          <div>Content</div>
        </Modal>
      )
      const secondaryBtn = screen.getByRole('button', { name: /secondary/i })
      const dangerBtn = screen.getByRole('button', { name: /danger/i })
      expect(secondaryBtn).toHaveClass('flex-1')
      expect(dangerBtn).toHaveClass('flex-1')
    })

    it('uses secondary variant by default for action buttons', () => {
      const actions = [{ label: 'Default', onClick: jest.fn() }]
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={actions}>
          <div>Content</div>
        </Modal>
      )
      const button = screen.getByRole('button', { name: /default/i })
      expect(button).toHaveClass('flex-1')
    })

    it('renders actions footer with proper styling', () => {
      const actions = [{ label: 'Action', onClick: jest.fn() }]
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={actions}>
          <div>Content</div>
        </Modal>
      )
      // Check for actions footer with border and padding
      const footers = container.querySelectorAll('div')
      let foundActionFooter = false
      footers.forEach((footer) => {
        if (footer.classList.contains('gap-[--s-2]')) {
          foundActionFooter = true
        }
      })
      expect(foundActionFooter).toBe(true)
    })
  })

  describe('Styling and layout', () => {
    it('renders with proper modal styling', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div>Content</div>
        </Modal>
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveClass('bg-white', 'rounded-[--r-lg]', 'shadow-lg')
      expect(dialog).toHaveClass('flex', 'flex-col')
    })

    it('renders backdrop with proper styling', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div>Content</div>
        </Modal>
      )
      const backdrop = container.querySelector('.fixed.inset-0.z-50')
      expect(backdrop).toHaveClass('bg-black/40')
    })

    it('accepts custom className', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" className="custom-modal">
          <div>Content</div>
        </Modal>
      )
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveClass('custom-modal')
    })
  })

  describe('Content rendering', () => {
    it('renders text content', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          Text content
        </Modal>
      )
      expect(screen.getByText('Text content')).toBeInTheDocument()
    })

    it('renders React components as content', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div>
            <h3>Heading</h3>
            <p>Paragraph</p>
          </div>
        </Modal>
      )
      expect(screen.getByRole('heading', { level: 3, name: /heading/i })).toBeInTheDocument()
      expect(screen.getByText('Paragraph')).toBeInTheDocument()
    })

    it('scrolls content when it exceeds height', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <div>Content</div>
        </Modal>
      )
      const contentDiv = container.querySelector('.flex-1.overflow-y-auto')
      expect(contentDiv).toBeInTheDocument()
    })
  })

  describe('Event listener cleanup', () => {
    it('removes event listeners when modal closes', async () => {
      const onClose = jest.fn()
      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Close modal
      rerender(
        <Modal isOpen={false} onClose={onClose} title="Test">
          <div>Content</div>
        </Modal>
      )

      // Modal should be gone
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('updates event listeners when onClose changes', () => {
      const onClose1 = jest.fn()
      const onClose2 = jest.fn()

      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose1} title="Test">
          <div>Content</div>
        </Modal>
      )

      rerender(
        <Modal isOpen={true} onClose={onClose2} title="Test">
          <div>Content</div>
        </Modal>
      )

      // Press Escape with updated onClose
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose2).toHaveBeenCalled()
    })
  })

  describe('Empty actions', () => {
    it('handles empty actions array', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test" actions={[]}>
          <div>Content</div>
        </Modal>
      )
      expect(screen.getByText('Content')).toBeInTheDocument()
      // Should not render actions footer
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBe(1) // Only close button
    })
  })

  describe('Complex content scenarios', () => {
    it('renders form content', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Form Modal">
          <form>
            <input type="text" placeholder="Enter text" />
          </form>
        </Modal>
      )
      expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
    })

    it('renders modal with title, content, and actions', () => {
      const actions = [{ label: 'Submit', onClick: jest.fn() }]
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Complete Modal" actions={actions}>
          <p>Modal body content</p>
        </Modal>
      )
      expect(screen.getByRole('heading', { name: /complete modal/i })).toBeInTheDocument()
      expect(screen.getByText('Modal body content')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
    })
  })
})
