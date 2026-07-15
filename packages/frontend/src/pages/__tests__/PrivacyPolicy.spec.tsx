/**
 * S9.1 — PrivacyPolicy page (RED first)
 *
 * Static page at /privacy (public). Sections: operator/contact, what we
 * store, AI features (group assistant + 1:1 Coach + memories + what's never
 * sent), retention/clear-conversation, rights (export/erasure), 18+ requirement.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { PrivacyPolicy } from '../PrivacyPolicy'

describe('PrivacyPolicy', () => {
  it('renders with data-testid="privacy-policy-page"', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByTestId('privacy-policy-page')).toBeInTheDocument()
  })

  it('describes the group assistant AI feature', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByText(/Anthropic/)).toBeInTheDocument()
    expect(screen.getByText(/visible to the group/i)).toBeInTheDocument()
  })

  it('describes the private 1:1 Coach AI feature', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByText(/visible only to you/i)).toBeInTheDocument()
  })

  it('describes memories: confirmed, listed and deletable in Profile, included in export/erasure', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByText(/only after you confirm/i)).toBeInTheDocument()
    expect(screen.getByText(/deletable in your Profile/i)).toBeInTheDocument()
  })

  it('describes what is never sent (emails, passwords, tokens)', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByText(/never sent/i)).toBeInTheDocument()
    expect(screen.getByText(/email addresses/i)).toBeInTheDocument()
    expect(screen.getByText(/passwords/i)).toBeInTheDocument()
  })

  it('states the 18+ requirement', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByText(/18/)).toBeInTheDocument()
  })

  it('describes export and erasure rights', () => {
    render(<PrivacyPolicy />)
    expect(screen.getByText(/export/i)).toBeInTheDocument()
    expect(screen.getByText(/erasure/i)).toBeInTheDocument()
  })
})
