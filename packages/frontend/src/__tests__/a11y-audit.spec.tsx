import { axe } from 'jest-axe'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Landing } from '../pages/Landing'
import { ResponsiveLayout } from '../components/shared/ResponsiveLayout'

describe('Accessibility Audit - WCAG AA Compliance', () => {
  describe('Landing Page', () => {
    it('should have no accessibility violations', async () => {
      const { container } = render(
        <BrowserRouter>
          <Landing />
        </BrowserRouter>
      )
      const results = await axe(container)
      expect(results.violations.length).toBe(0)
    })

    it('should have proper heading hierarchy', () => {
      const { container } = render(
        <BrowserRouter>
          <Landing />
        </BrowserRouter>
      )
      const h1s = container.querySelectorAll('h1')
      const h2s = container.querySelectorAll('h2')
      expect(h1s.length).toBeGreaterThan(0)
      expect(h2s.length).toBeGreaterThan(0)
    })

    it('should have sufficient color contrast', async () => {
      const { container } = render(
        <BrowserRouter>
          <Landing />
        </BrowserRouter>
      )
      const results = await axe(container, {
        rules: {
          'color-contrast': { enabled: true }
        }
      })
      expect(results.violations.length).toBe(0)
    })
  })

  describe('Navigation Components', () => {
    it('should have keyboard accessible navigation', () => {
      const { container } = render(
        <BrowserRouter>
          <ResponsiveLayout>
            <div>Test content</div>
          </ResponsiveLayout>
        </BrowserRouter>
      )
      const navLinks = container.querySelectorAll('a')
      expect(navLinks.length).toBeGreaterThan(0)
    })

    it('should have aria-label on navigation landmarks', () => {
      const { container } = render(
        <BrowserRouter>
          <ResponsiveLayout>
            <div>Test</div>
          </ResponsiveLayout>
        </BrowserRouter>
      )
      const navs = container.querySelectorAll('nav')
      expect(navs.length).toBeGreaterThan(0)
      navs.forEach(nav => {
        expect(nav.getAttribute('aria-label')).toBeTruthy()
      })
    })
  })

  describe('Button Accessibility', () => {
    it('should have accessible button text', () => {
      const { container } = render(
        <BrowserRouter>
          <Landing />
        </BrowserRouter>
      )
      const buttons = container.querySelectorAll('button')
      buttons.forEach(button => {
        const hasText = button.textContent?.trim().length ?? 0 > 0
        const hasAriaLabel = button.getAttribute('aria-label')
        expect(hasText || hasAriaLabel).toBeTruthy()
      })
    })
  })

  describe('Semantic HTML', () => {
    it('should use semantic elements', () => {
      const { container } = render(
        <BrowserRouter>
          <ResponsiveLayout>
            <div>Content</div>
          </ResponsiveLayout>
        </BrowserRouter>
      )
      expect(container.querySelector('header')).toBeTruthy()
      expect(container.querySelector('nav')).toBeTruthy()
      expect(container.querySelector('main')).toBeTruthy()
    })
  })

  describe('ARIA Attributes', () => {
    it('should have proper aria-hidden on decorative icons', async () => {
      const { container } = render(
        <BrowserRouter>
          <ResponsiveLayout>
            <div>Test</div>
          </ResponsiveLayout>
        </BrowserRouter>
      )
      const icons = container.querySelectorAll('[aria-hidden="true"]')
      expect(icons.length).toBeGreaterThan(0)
    })
  })

  describe('Focus Management', () => {
    it('should allow focus on interactive elements', () => {
      const { container } = render(
        <BrowserRouter>
          <Landing />
        </BrowserRouter>
      )
      const button = container.querySelector('button')
      expect(button).toBeTruthy()
      button?.focus()
      expect(document.activeElement).toBe(button)
    })
  })
})
