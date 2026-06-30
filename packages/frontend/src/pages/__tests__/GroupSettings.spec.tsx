/**
 * P1.4 + P1.5 — Group page header + Group Settings shell + notify-level + leave
 *
 * Tests cover:
 * - GroupDetail renders a header with data-testid="group-detail-header"
 * - GroupDetail renders a settings gear button with data-testid="group-settings-gear"
 * - Settings gear links to /groups/:groupId/settings
 * - GroupSettings renders with data-testid="group-settings-page"
 * - Owner sees data-testid="group-settings-owner-section"
 * - Member does NOT see data-testid="group-settings-owner-section"
 * - Both owner and member see data-testid="group-settings-member-section"
 * - NotifyLevelControl appears in the member section
 * - Leave button appears in the member section and calls DELETE + navigates
 */

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { GroupDetail, GroupSettings } from '../MyGroups'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

// ── Fetch mock ────────────────────────────────────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn()

// ── Mock reconnecting-eventsource (SSE not in jsdom) ─────────────────────────

jest.mock('reconnecting-eventsource', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }))
})

// ── Auth mock ─────────────────────────────────────────────────────────────────

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'acc_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGroupsResponse(role: 'owner' | 'member') {
  return {
    ok: true,
    json: async () => ({
      groups: [
        { id: 'grp_1', name: 'Pickleball Crew', role, memberCount: 4 },
      ],
    }),
  }
}

function renderGroupDetail(groupId = 'grp_1', role: 'owner' | 'member' = 'owner') {
  mockFetch.mockResolvedValue(makeGroupsResponse(role))
  return render(
    <MemoryRouter initialEntries={[`/groups/${groupId}`]}>
      <Routes>
        <Route path="/groups/:groupId" element={<GroupDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

function renderGroupSettings(groupId = 'grp_1', role: 'owner' | 'member' = 'owner') {
  mockFetch.mockResolvedValue(makeGroupsResponse(role))
  return render(
    <MemoryRouter initialEntries={[`/groups/${groupId}/settings`]}>
      <Routes>
        <Route path="/groups/:groupId/settings" element={<GroupSettings />} />
      </Routes>
    </MemoryRouter>
  )
}

// ── GroupDetail header tests ──────────────────────────────────────────────────

describe('GroupDetail — header', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders a header with data-testid="group-detail-header"', async () => {
    renderGroupDetail()
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-header')).toBeInTheDocument()
    })
  })

  it('displays the group name in the header', async () => {
    renderGroupDetail()
    await waitFor(() => {
      expect(screen.getByTestId('group-detail-header')).toHaveTextContent('Pickleball Crew')
    })
  })

  it('renders a settings gear button with data-testid="group-settings-gear"', async () => {
    renderGroupDetail()
    await waitFor(() => {
      expect(screen.getByTestId('group-settings-gear')).toBeInTheDocument()
    })
  })

  it('settings gear has an accessible label', async () => {
    renderGroupDetail()
    await waitFor(() => {
      const gear = screen.getByTestId('group-settings-gear')
      expect(gear).toHaveAttribute('aria-label')
    })
  })

  it('settings gear links to /groups/:groupId/settings', async () => {
    renderGroupDetail('grp_1')
    await waitFor(() => {
      const gear = screen.getByTestId('group-settings-gear')
      expect(gear.closest('a')).toHaveAttribute('href', '/groups/grp_1/settings')
    })
  })
})

// ── GroupSettings page tests ──────────────────────────────────────────────────

describe('GroupSettings — owner', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with data-testid="group-settings-page"', async () => {
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('group-settings-page')).toBeInTheDocument()
    })
  })

  it('shows the member section', async () => {
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('group-settings-member-section')).toBeInTheDocument()
    })
  })

  it('shows owner-only section for owners', async () => {
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('group-settings-owner-section')).toBeInTheDocument()
    })
  })
})

describe('GroupSettings — member', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with data-testid="group-settings-page"', async () => {
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.getByTestId('group-settings-page')).toBeInTheDocument()
    })
  })

  it('shows the member section', async () => {
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.getByTestId('group-settings-member-section')).toBeInTheDocument()
    })
  })

  it('does NOT show owner-only section for members', async () => {
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.queryByTestId('group-settings-owner-section')).not.toBeInTheDocument()
    })
  })
})

// ── P1.5: NotifyLevelControl + Leave in member section ────────────────────────

describe('GroupSettings — P1.5 notify-level control', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue(makeGroupsResponse('member'))
  })

  it('shows the notify-level control inside the member section', async () => {
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      const memberSection = screen.getByTestId('group-settings-member-section')
      expect(memberSection).toBeInTheDocument()
      expect(memberSection.querySelector('[data-testid="notify-level-control"]')).toBeTruthy()
    })
  })

  it('renders all three notify-level options', async () => {
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.getByTestId('notify-level-option-all')).toBeInTheDocument()
      expect(screen.getByTestId('notify-level-option-mentions-polls')).toBeInTheDocument()
      expect(screen.getByTestId('notify-level-option-muted')).toBeInTheDocument()
    })
  })

  it('selecting an option calls PATCH notify-level endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('member'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.getByTestId('notify-level-option-muted')).toBeInTheDocument()
    })

    const mutedInput = screen.getByRole('radio', { name: /muted/i })
    fireEvent.click(mutedInput)

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/notify-level')
      )
      expect(patchCall).toBeDefined()
      expect(patchCall[1]).toMatchObject({
        method: 'PATCH',
        body: JSON.stringify({ notifyLevel: 'muted' }),
      })
    })
  })
})

describe('GroupSettings — P1.5 leave group', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue(makeGroupsResponse('member'))
  })

  it('shows a leave-group button inside the member section', async () => {
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      const memberSection = screen.getByTestId('group-settings-member-section')
      expect(memberSection.querySelector('[data-testid="leave-group-button"]')).toBeTruthy()
    })
  })

  it('leave button calls DELETE .../leave and navigates to /groups', async () => {
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('member'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.getByTestId('leave-group-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('leave-group-button'))

    await waitFor(() => {
      const deleteCall = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/leave')
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall[1]).toMatchObject({ method: 'DELETE' })
      expect(mockNavigate).toHaveBeenCalledWith('/groups')
    })
  })
})
