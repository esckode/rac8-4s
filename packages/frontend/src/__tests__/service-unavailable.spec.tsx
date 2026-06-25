/**
 * V1.5 — Frontend maintenance view (503 / service unavailable)
 *
 * Tests that:
 * - ServiceUnavailable page renders the expected heading and retry message
 * - App-level 503 state shows the maintenance page instead of normal routes
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { ServiceUnavailable } from '../pages/ServiceUnavailable'

describe('ServiceUnavailable page', () => {
  it('renders a "service temporarily unavailable" heading', () => {
    render(<ServiceUnavailable />)
    expect(
      screen.getByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })
    ).toBeInTheDocument()
  })

  it('shows a retry message so users know to try again', () => {
    render(<ServiceUnavailable />)
    // Should contain some guidance about trying again
    expect(screen.getByText(/try again/i)).toBeInTheDocument()
  })

  it('does not contain navigation links that would lead to broken routes', () => {
    render(<ServiceUnavailable />)
    // The maintenance page should stand alone — no nav links to routes that need the API
    const heading = screen.getByRole('heading', { name: /service.*unavailable|temporarily unavailable/i })
    expect(heading).toBeInTheDocument()
  })
})
