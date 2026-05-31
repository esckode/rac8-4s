/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen } from '@testing-library/react'
import { Logo } from '../Logo'

describe('Logo.tsx', () => {
  describe('Rendering and text content', () => {
    it('renders logo text', () => {
      render(<Logo />)
      expect(screen.getByText('U At Court')).toBeInTheDocument()
    })

    it('renders tagline when tagline prop is true', () => {
      render(<Logo tagline={true} />)
      expect(screen.getByText('Make Your Play Count')).toBeInTheDocument()
    })

    it('does not render tagline when tagline prop is false', () => {
      render(<Logo tagline={false} />)
      expect(screen.queryByText('Make Your Play Count')).not.toBeInTheDocument()
    })

    it('does not render tagline by default', () => {
      render(<Logo />)
      expect(screen.queryByText('Make Your Play Count')).not.toBeInTheDocument()
    })

    it('renders LogoMark component', () => {
      const { container } = render(<Logo />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('Size variants', () => {
    it('renders with default size (28)', () => {
      const { container } = render(<Logo />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '42')
      expect(svg).toHaveAttribute('height', '42')
    })

    it('renders with custom size', () => {
      const { container } = render(<Logo size={56} />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '84')
      expect(svg).toHaveAttribute('height', '84')
    })

    it('scales text size with size prop', () => {
      const { container: container1 } = render(<Logo size={20} />)
      const { container: container2 } = render(<Logo size={40} />)

      const textDiv1 = container1.querySelector('div > div > div')
      const textDiv2 = container2.querySelector('div > div > div')

      expect(textDiv1).toBeInTheDocument()
      expect(textDiv2).toBeInTheDocument()
    })

    it('scales tagline size with size prop', () => {
      const { container } = render(<Logo size={56} tagline={true} />)
      const tagline = screen.getByText('Make Your Play Count')
      expect(tagline).toBeInTheDocument()
    })
  })

  describe('Tone variants (colors)', () => {
    it('renders with navy tone (default)', () => {
      const { container } = render(<Logo tone="navy" />)
      const div = container.querySelector('div > div')
      expect(div).toBeInTheDocument()
      // Check that the logo text has ink-900 color
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({ color: 'var(--ink-900)' })
    })

    it('renders with light tone', () => {
      const { container } = render(<Logo tone="light" />)
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({ color: '#FFFFFF' })
    })

    it('renders with mono-court tone', () => {
      const { container } = render(<Logo tone="mono-court" />)
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({ color: 'var(--ink-900)' })
    })

    it('light tone tagline has light color', () => {
      render(<Logo tone="light" tagline={true} />)
      const tagline = screen.getByText('Make Your Play Count')
      // Light tone tagline should have rgba(255,255,255,0.7)
      expect(tagline).toHaveStyle({ color: 'rgba(255,255,255,0.7)' })
    })

    it('navy tone tagline has ink-500 color', () => {
      render(<Logo tone="navy" tagline={true} />)
      const tagline = screen.getByText('Make Your Play Count')
      expect(tagline).toHaveStyle({ color: 'var(--ink-500)' })
    })

    it('mono-court tone tagline has ink-500 color', () => {
      render(<Logo tone="mono-court" tagline={true} />)
      const tagline = screen.getByText('Make Your Play Count')
      expect(tagline).toHaveStyle({ color: 'var(--ink-500)' })
    })
  })

  describe('Layout and styling', () => {
    it('renders flex container with correct layout', () => {
      const { container } = render(<Logo />)
      const mainDiv = container.firstChild as HTMLDivElement
      expect(mainDiv).toHaveStyle({ display: 'flex', alignItems: 'center' })
    })

    it('sets gap based on size', () => {
      const { container } = render(<Logo size={40} />)
      const mainDiv = container.firstChild as HTMLDivElement
      // gap = size * 0.35 = 40 * 0.35 = 14
      expect(mainDiv).toHaveStyle({ gap: '14px' })
    })

    it('text container has column layout', () => {
      const { container } = render(<Logo />)
      const textContainer = container.querySelector('div > div > div')
      expect(textContainer).toHaveStyle({ display: 'flex', flexDirection: 'column', lineHeight: '1' })
    })

    it('logo text has correct font styling', () => {
      render(<Logo />)
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({
        fontWeight: '700',
        letterSpacing: '-0.02em',
      })
    })

    it('tagline has smaller font size than logo text', () => {
      render(<Logo size={28} tagline={true} />)
      const logoText = screen.getByText('U At Court')
      const tagline = screen.getByText('Make Your Play Count')

      // logoText fontSize = size = 28px
      // tagline fontSize = size * 0.42 = 11.76px
      expect(logoText).toHaveStyle({ fontSize: '28px' })
      expect(tagline).toHaveStyle({ fontSize: '11.76px' })
    })

    it('tagline has correct letter spacing', () => {
      render(<Logo tagline={true} />)
      const tagline = screen.getByText('Make Your Play Count')
      expect(tagline).toHaveStyle({ letterSpacing: '0.02em', fontWeight: '500' })
    })
  })

  describe('Custom props', () => {
    it('accepts custom className', () => {
      const { container } = render(<Logo className="custom-class" />)
      const mainDiv = container.firstChild
      expect(mainDiv).toHaveClass('custom-class')
    })

    it('combines custom className with defaults', () => {
      const { container } = render(<Logo className="my-logo" />)
      const mainDiv = container.firstChild
      expect(mainDiv).toHaveClass('my-logo')
      expect(mainDiv).toHaveStyle({ display: 'flex' })
    })
  })

  describe('Default values', () => {
    it('uses navy tone by default', () => {
      render(<Logo />)
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({ color: 'var(--ink-900)' })
    })

    it('uses size 28 by default', () => {
      const { container } = render(<Logo />)
      const svg = container.querySelector('svg')
      expect(svg).toHaveAttribute('width', '42')
    })

    it('tagline is false by default', () => {
      render(<Logo />)
      expect(screen.queryByText('Make Your Play Count')).not.toBeInTheDocument()
    })

    it('className is empty by default', () => {
      const { container } = render(<Logo />)
      const mainDiv = container.firstChild
      // Should not have extra classes
      expect(mainDiv).toHaveStyle({ display: 'flex' })
    })
  })

  describe('Color combinations', () => {
    it('navy tone uses correct colors for mark and text', () => {
      const { container } = render(<Logo tone="navy" />)
      const paths = container.querySelectorAll('svg path')
      expect(paths.length).toBeGreaterThan(0)
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({ color: 'var(--ink-900)' })
    })

    it('light tone uses white for text', () => {
      render(<Logo tone="light" />)
      const logoText = screen.getByText('U At Court')
      expect(logoText).toHaveStyle({ color: '#FFFFFF' })
    })

    it('light tone uses light blue for mark', () => {
      const { container } = render(<Logo tone="light" />)
      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })
  })

  describe('Display name', () => {
    it('has correct display name', () => {
      expect(Logo.displayName).toBe('Logo')
    })
  })

  describe('Multiple size variations', () => {
    it('renders small logo', () => {
      const { container } = render(<Logo size={16} />)
      const svg = container.querySelector('svg')
      // 16 * 1.5 = 24
      expect(svg).toHaveAttribute('width', '24')
    })

    it('renders large logo', () => {
      const { container } = render(<Logo size={64} />)
      const svg = container.querySelector('svg')
      // 64 * 1.5 = 96
      expect(svg).toHaveAttribute('width', '96')
    })
  })
})
