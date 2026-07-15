/**
 * S7.1 — pinned Coach entry atop the conversations list (RED first)
 *
 * MyGroups' GroupList always shows a pinned "Coach" entry first, regardless
 * of how many groups the player has (including zero) — COACH_1TO1_DESIGN.md
 * §7 #9: exists for every authenticated account-holder.
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupList } from '../MyGroups'

const mockFetch = jest.fn()
global.fetch = mockFetch

function groupsResponse(groups: Array<Record<string, unknown>>) {
  return { ok: true, json: async () => ({ groups }) }
}

describe('GroupList — pinned Coach entry', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders a pinned Coach entry first, before any groups', async () => {
    mockFetch.mockResolvedValue(groupsResponse([
      { id: 'grp_1', name: 'Pickleball Crew', role: 'owner', memberCount: 4 },
    ]))

    render(<MemoryRouter><GroupList /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('coach-entry')).toBeInTheDocument()
    })
    expect(screen.getByTestId('coach-entry')).toHaveTextContent(/your private coach/i)

    const items = screen.getAllByTestId(/coach-entry|group-list-item/)
    expect(items[0]).toBe(screen.getByTestId('coach-entry'))
  })

  it('still renders the Coach entry for a zero-group player', async () => {
    mockFetch.mockResolvedValue(groupsResponse([]))

    render(<MemoryRouter><GroupList /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('coach-entry')).toBeInTheDocument()
    })
  })

  it('links to /coach', async () => {
    mockFetch.mockResolvedValue(groupsResponse([]))

    render(<MemoryRouter><GroupList /></MemoryRouter>)

    await waitFor(() => {
      expect(screen.getByTestId('coach-entry')).toHaveAttribute('href', '/coach')
    })
  })
})
