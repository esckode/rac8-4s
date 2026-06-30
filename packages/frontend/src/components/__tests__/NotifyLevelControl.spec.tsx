/**
 * P1.5 — NotifyLevelControl unit tests (RED phase)
 *
 * Tests cover:
 * - Renders three options: all, mentions_polls, muted
 * - The option matching currentLevel is pre-selected
 * - Selecting a different option fires PATCH /player/groups/:groupId/members/:playerId/notify-level
 * - Correct data-testids on each option and the control container
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotifyLevelControl } from '../NotifyLevelControl'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  jest.clearAllMocks()
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
})

describe('NotifyLevelControl', () => {
  it('renders three options: all, mentions_polls, muted', () => {
    render(
      <NotifyLevelControl
        groupId="grp_1"
        playerId="player_1"
        currentLevel="mentions_polls"
      />
    )

    expect(screen.getByTestId('notify-level-option-all')).toBeInTheDocument()
    expect(screen.getByTestId('notify-level-option-mentions-polls')).toBeInTheDocument()
    expect(screen.getByTestId('notify-level-option-muted')).toBeInTheDocument()
  })

  it('pre-selects the option matching currentLevel', () => {
    render(
      <NotifyLevelControl
        groupId="grp_1"
        playerId="player_1"
        currentLevel="muted"
      />
    )

    const mutedInput = screen.getByTestId('notify-level-option-muted').querySelector('input[type="radio"]')
      ?? screen.getByRole('radio', { name: /muted/i })
    expect(mutedInput).toBeChecked()
  })

  it('pre-selects "all" when currentLevel is "all"', () => {
    render(
      <NotifyLevelControl
        groupId="grp_1"
        playerId="player_1"
        currentLevel="all"
      />
    )

    const allInput = screen.getByTestId('notify-level-option-all').querySelector('input[type="radio"]')
      ?? screen.getByRole('radio', { name: /all/i })
    expect(allInput).toBeChecked()
  })

  it('calls PATCH /player/groups/:groupId/members/:playerId/notify-level when selection changes', async () => {
    render(
      <NotifyLevelControl
        groupId="grp_1"
        playerId="player_1"
        currentLevel="mentions_polls"
      />
    )

    const mutedInput = screen.getByRole('radio', { name: /muted/i })
    fireEvent.click(mutedInput)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/player/groups/grp_1/members/player_1/notify-level',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ notifyLevel: 'muted' }),
        })
      )
    })
  })

  it('renders the control with data-testid="notify-level-control"', () => {
    render(
      <NotifyLevelControl
        groupId="grp_1"
        playerId="player_1"
        currentLevel="all"
      />
    )

    expect(screen.getByTestId('notify-level-control')).toBeInTheDocument()
  })

  it('uses a radio group (fieldset + legend) for accessibility', () => {
    render(
      <NotifyLevelControl
        groupId="grp_1"
        playerId="player_1"
        currentLevel="all"
      />
    )

    // Should render as a group role for screen readers
    const group = screen.getByRole('group')
    expect(group).toBeInTheDocument()
  })
})
