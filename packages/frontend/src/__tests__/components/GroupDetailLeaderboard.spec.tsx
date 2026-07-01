/**
 * P3.9 RED — GroupDetail leaderboard tab
 *
 * GroupDetail should have a "Leaderboard" tab alongside "Chat" and "Members".
 * When clicked it fetches the individual leaderboard and renders names (not UUIDs).
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { GroupDetail } from '../../pages/MyGroups'

const mockFetch = jest.fn()
global.fetch = mockFetch

window.HTMLElement.prototype.scrollIntoView = jest.fn()

jest.mock('reconnecting-eventsource', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }))
})

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'acc_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../hooks/useGroupMessages', () => ({
  useGroupMessages: () => ({ messages: [], send: jest.fn() }),
  clearGroupMessageStores: jest.fn(),
}))

jest.mock('../../hooks/useGroupList', () => ({
  useGroupList: () => ({
    groups: [{ id: 'grp_1', name: 'Tennis Club', role: 'owner', memberCount: 4 }],
  }),
}))

function renderGroupDetail() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ messages: [], members: [], leaderboard: [] }),
  })
  return render(
    <MemoryRouter initialEntries={['/groups/grp_1']}>
      <Routes>
        <Route path="/groups/:groupId" element={<GroupDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('GroupDetail — Leaderboard tab (P3.9)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows a Leaderboard tab button', () => {
    renderGroupDetail()
    expect(screen.getByTestId('group-tab-leaderboard')).toBeInTheDocument()
  })

  it('clicking Leaderboard tab shows leaderboard panel', async () => {
    renderGroupDetail()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leaderboard: [
          { playerId: 'p1', nameSnapshot: 'Alice', wins: 3, losses: 1 },
        ],
      }),
    })
    fireEvent.click(screen.getByTestId('group-tab-leaderboard'))
    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-panel')).toBeInTheDocument()
    })
  })

  it('fetches leaderboard from the group endpoint when tab is clicked', async () => {
    renderGroupDetail()
    fireEvent.click(screen.getByTestId('group-tab-leaderboard'))
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    const calls = (mockFetch as jest.Mock).mock.calls.map((c: unknown[]) => c[0])
    expect(calls.some((url: unknown) => typeof url === 'string' && url.includes('/leaderboard/individual'))).toBe(true)
  })

  it('renders player names (nameSnapshot), not UUIDs, in leaderboard', async () => {
    renderGroupDetail()
    // Override mock AFTER initial render so leaderboard fetch gets Alice data
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leaderboard: [
          { playerId: 'plr_deadbeef', nameSnapshot: 'Alice', wins: 5, losses: 0 },
        ],
      }),
    })
    fireEvent.click(screen.getByTestId('group-tab-leaderboard'))
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument())
    expect(screen.queryByText('plr_deadbeef')).toBeNull()
  })
})
