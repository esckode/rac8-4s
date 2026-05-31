/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '../Button'

describe('Button.tsx', () => {
  describe('Variants', () => {
    it('renders with primary variant', () => {
      render(<Button variant="primary">Click me</Button>)
      const btn = screen.getByRole('button', { name: /click me/i })
      expect(btn).toHaveClass('text-white')
      expect(btn).toHaveStyle({ backgroundColor: 'var(--court-400)' })
    })

    it('renders with secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>)
      const btn = screen.getByRole('button', { name: /secondary/i })
      expect(btn).toHaveClass('text-white')
      expect(btn).toHaveStyle({ backgroundColor: 'var(--lavender-400)' })
    })

    it('renders with outline variant', () => {
      render(<Button variant="outline">Outline</Button>)
      const btn = screen.getByRole('button', { name: /outline/i })
      expect(btn).toHaveClass('bg-transparent', 'border-2', 'text-[--court-600]')
      expect(btn).toHaveStyle({ borderColor: 'var(--court-400)' })
    })

    it('renders with ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>)
      const btn = screen.getByRole('button', { name: /ghost/i })
      expect(btn).toHaveClass('bg-transparent', 'text-[--ink-600]')
    })

    it('renders with soft variant', () => {
      render(<Button variant="soft">Soft</Button>)
      const btn = screen.getByRole('button', { name: /soft/i })
      expect(btn).toHaveStyle({ backgroundColor: 'var(--court-100)' })
      expect(btn).toHaveClass('text-[--court-700]')
    })

    it('renders with dark variant', () => {
      render(<Button variant="dark">Dark</Button>)
      const btn = screen.getByRole('button', { name: /dark/i })
      expect(btn).toHaveClass('text-white')
      expect(btn).toHaveStyle({ backgroundColor: 'var(--ink-900)' })
    })
  })

  describe('Sizes', () => {
    it('renders with small size', () => {
      render(<Button size="sm">Small</Button>)
      const btn = screen.getByRole('button', { name: /small/i })
      expect(btn).toHaveClass('px-[--s-3]', 'py-[--s-2]', 'text-sm', 'min-h-[36px]')
      expect(btn).toHaveStyle({ borderRadius: 'var(--r-md)' })
    })

    it('renders with medium size', () => {
      render(<Button size="md">Medium</Button>)
      const btn = screen.getByRole('button', { name: /medium/i })
      expect(btn).toHaveClass('px-[--s-4]', 'py-[--s-3]', 'text-base', 'min-h-[44px]')
      expect(btn).toHaveStyle({ borderRadius: 'var(--r-lg)' })
    })

    it('renders with large size', () => {
      render(<Button size="lg">Large</Button>)
      const btn = screen.getByRole('button', { name: /large/i })
      expect(btn).toHaveClass('px-[--s-6]', 'py-[--s-4]', 'text-base', 'min-h-[48px]')
      expect(btn).toHaveStyle({ borderRadius: 'var(--r-lg)' })
    })
  })

  describe('States', () => {
    it('renders disabled state', () => {
      render(<Button disabled>Disabled</Button>)
      const btn = screen.getByRole('button', { name: /disabled/i })
      expect(btn).toBeDisabled()
      expect(btn).toHaveClass('opacity-60', 'cursor-not-allowed')
    })

    it('handles click events when enabled', () => {
      const onClick = jest.fn()
      render(<Button onClick={onClick}>Click me</Button>)
      const btn = screen.getByRole('button', { name: /click me/i })
      fireEvent.click(btn)
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not trigger click when disabled', () => {
      const onClick = jest.fn()
      render(<Button disabled onClick={onClick}>Disabled</Button>)
      const btn = screen.getByRole('button', { name: /disabled/i })
      fireEvent.click(btn)
      expect(onClick).not.toHaveBeenCalled()
    })

    it('renders loading state with spinner', () => {
      render(<Button loading>Loading</Button>)
      const btn = screen.getByRole('button')
      expect(btn).toBeDisabled()
      expect(btn).toHaveClass('opacity-60', 'cursor-not-allowed')
      // Spinner SVG should be rendered
      const spinner = btn.querySelector('svg')
      expect(spinner).toBeInTheDocument()
      expect(spinner).toHaveClass('animate-spin')
    })

    it('disables button when loading', () => {
      render(<Button loading>Loading</Button>)
      const btn = screen.getByRole('button')
      expect(btn).toBeDisabled()
    })

    it('shows text alongside loading spinner', () => {
      render(<Button loading>Processing</Button>)
      expect(screen.getByText('Processing')).toBeInTheDocument()
    })

    it('renders as normal button when not loading', () => {
      const { container } = render(<Button>Normal</Button>)
      const btn = screen.getByRole('button', { name: /normal/i })
      // No spinner should be rendered
      const spinner = btn.querySelector('svg.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })
  })

  describe('Focus and transitions', () => {
    it('has focus styles', () => {
      render(<Button>Focus test</Button>)
      const btn = screen.getByRole('button')
      expect(btn).toHaveClass('focus:outline-none', 'focus:ring-4', 'focus:ring-[--court-400]')
    })

    it('has transition classes', () => {
      render(<Button>Transition test</Button>)
      const btn = screen.getByRole('button')
      expect(btn).toHaveClass('transition-all', 'duration-[--duration-normal]', 'ease-[--easing-snap]')
    })
  })

  describe('Custom props and styles', () => {
    it('accepts custom className', () => {
      render(<Button className="custom-class">Custom</Button>)
      const btn = screen.getByRole('button', { name: /custom/i })
      expect(btn).toHaveClass('custom-class')
    })

    it('accepts custom inline styles', () => {
      render(<Button style={{ color: 'red' }}>Styled</Button>)
      const btn = screen.getByRole('button', { name: /styled/i })
      expect(btn).toHaveStyle({ color: 'red' })
    })

    it('accepts custom HTML attributes', () => {
      render(<Button data-testid="custom-btn">Test</Button>)
      const btn = screen.getByTestId('custom-btn')
      expect(btn).toBeInTheDocument()
    })

    it('forwards ref correctly', () => {
      const ref = React.createRef<HTMLButtonElement>()
      render(<Button ref={ref}>Ref test</Button>)
      expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    })
  })

  describe('Default values', () => {
    it('uses primary variant by default', () => {
      render(<Button>Default</Button>)
      const btn = screen.getByRole('button', { name: /default/i })
      expect(btn).toHaveClass('text-white')
      expect(btn).toHaveStyle({ backgroundColor: 'var(--court-400)' })
    })

    it('uses medium size by default', () => {
      render(<Button>Default Size</Button>)
      const btn = screen.getByRole('button', { name: /default size/i })
      expect(btn).toHaveClass('px-[--s-4]', 'py-[--s-3]', 'min-h-[44px]')
    })

    it('is not loading by default', () => {
      render(<Button>Default</Button>)
      const btn = screen.getByRole('button')
      const spinner = btn.querySelector('svg.animate-spin')
      expect(spinner).not.toBeInTheDocument()
    })

    it('is not disabled by default', () => {
      render(<Button>Default</Button>)
      const btn = screen.getByRole('button')
      expect(btn).not.toBeDisabled()
    })
  })

  describe('Display name', () => {
    it('has correct display name', () => {
      expect(Button.displayName).toBe('Button')
    })
  })
})
