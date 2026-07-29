/**
 * About — /about (UAT ISSUE-36)
 *
 * Support is two-tier: non-technical problems (fixtures, membership,
 * scheduling) go to the player's group owners; no technical-contact
 * destination exists yet, so this page deliberately ships without one.
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { About } from '../About'

function renderAbout() {
  return render(
    <MemoryRouter>
      <About />
    </MemoryRouter>
  )
}

describe('About', () => {
  it('renders the group-owner support guidance', () => {
    renderAbout()

    expect(screen.getByTestId('support-section')).toHaveTextContent(
      /message your group owners in the group/i
    )
  })

  it('links to the groups page', () => {
    renderAbout()

    expect(screen.getByTestId('support-groups-link')).toHaveAttribute('href', '/groups')
  })

  it('does not promise a technical-contact destination that does not exist', () => {
    renderAbout()

    const body = screen.getByTestId('about-page').textContent ?? ''
    expect(body).not.toMatch(/contact support|email us|support@/i)
  })
})
