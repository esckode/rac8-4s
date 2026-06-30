/**
 * P1.4 + P1.5 + P1.6 — Group page header + Group Settings shell + notify-level + leave +
 *   owner member management + group config
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
 * P1.6:
 * - ManageMembersList renders with data-testid="manage-members-list"
 * - Member rows render with promote button but no demote button
 * - Owner rows render with demote button but no promote button
 * - Kick button opens confirm dialog
 * - Kick confirm calls DELETE .../kick
 * - 409 LAST_OWNER shows inline error message
 * - Group name input and save button call PATCH
 * - Match format select calls PATCH
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

// ── P1.6: ManageMembersList ────────────────────────────────────────────────────

function makeOwnerSettingsWithMembers(members: unknown[]) {
  mockFetch
    .mockResolvedValueOnce(makeGroupsResponse('owner'))          // useGroupList
    .mockResolvedValueOnce({                                     // members fetch
      ok: true,
      json: async () => ({ members }),
    })
}

describe('GroupSettings — P1.6 ManageMembersList', () => {
  const selfId = 'player_1'  // matches auth mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders manage-members-list inside the owner section', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
    ])
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('manage-members-list')).toBeInTheDocument()
    })
  })

  it('shows a member row for each member', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'member', joinedAt: '' },
    ])
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId(`member-row-${selfId}`)).toBeInTheDocument()
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })
  })

  it('shows promote button for member rows, not for owner rows', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'member', joinedAt: '' },
    ])
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      const memberRow = screen.getByTestId('member-row-player_2')
      expect(memberRow.querySelector('[data-testid="promote-button"]')).toBeTruthy()
      const ownerRow = screen.getByTestId(`member-row-${selfId}`)
      expect(ownerRow.querySelector('[data-testid="promote-button"]')).toBeFalsy()
    })
  })

  it('shows demote button for other owner rows, not for member rows', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'owner', joinedAt: '' },
      { playerId: 'player_3', name: 'Bob', role: 'member', joinedAt: '' },
    ])
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      const aliceRow = screen.getByTestId('member-row-player_2')
      expect(aliceRow.querySelector('[data-testid="demote-button"]')).toBeTruthy()
      const bobRow = screen.getByTestId('member-row-player_3')
      expect(bobRow.querySelector('[data-testid="demote-button"]')).toBeFalsy()
    })
  })

  it('clicking promote calls POST .../promote', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'member', joinedAt: '' },
    ])
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    renderGroupSettings('grp_1', 'owner')

    await waitFor(() => {
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })

    const memberRow = screen.getByTestId('member-row-player_2')
    const promoteBtn = memberRow.querySelector('[data-testid="promote-button"]') as HTMLElement
    fireEvent.click(promoteBtn)

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/promote')
      )
      expect(call).toBeDefined()
      expect(call[1]).toMatchObject({ method: 'POST' })
    })
  })

  it('clicking demote calls POST .../demote', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'owner', joinedAt: '' },
    ])
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    renderGroupSettings('grp_1', 'owner')

    await waitFor(() => {
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })

    const aliceRow = screen.getByTestId('member-row-player_2')
    const demoteBtn = aliceRow.querySelector('[data-testid="demote-button"]') as HTMLElement
    fireEvent.click(demoteBtn)

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/demote')
      )
      expect(call).toBeDefined()
      expect(call[1]).toMatchObject({ method: 'POST' })
    })
  })

  it('kicking a member opens a confirm dialog', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'member', joinedAt: '' },
    ])
    renderGroupSettings('grp_1', 'owner')

    await waitFor(() => {
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })

    const memberRow = screen.getByTestId('member-row-player_2')
    const kickBtn = memberRow.querySelector('[data-testid="kick-button"]') as HTMLElement
    fireEvent.click(kickBtn)

    await waitFor(() => {
      expect(screen.getByTestId('kick-confirm-dialog')).toBeInTheDocument()
    })
  })

  it('confirming kick calls DELETE .../kick', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'member', joinedAt: '' },
    ])
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    renderGroupSettings('grp_1', 'owner')

    await waitFor(() => {
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })

    const memberRow = screen.getByTestId('member-row-player_2')
    fireEvent.click(memberRow.querySelector('[data-testid="kick-button"]') as HTMLElement)
    await waitFor(() => expect(screen.getByTestId('kick-confirm-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('kick-confirm-button'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/members/player_2') && !url.includes('promote') && !url.includes('demote') && !url.includes('leave') && !url.includes('notify')
      )
      expect(call).toBeDefined()
      expect(call[1]).toMatchObject({ method: 'DELETE' })
    })
  })

  it('409 LAST_OWNER from demote shows inline error', async () => {
    // Two owners: me and Alice. Demoting Alice returns 409 (race condition).
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('owner'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [
        { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
        { playerId: 'player_2', name: 'Alice', role: 'owner', joinedAt: '' },
      ]}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ code: 'LAST_OWNER', message: 'Cannot remove the last owner' }),
      })

    renderGroupSettings('grp_1', 'owner')

    await waitFor(() => {
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })

    const aliceRow = screen.getByTestId('member-row-player_2')
    fireEvent.click(aliceRow.querySelector('[data-testid="demote-button"]') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByTestId('last-owner-error')).toBeInTheDocument()
    })
  })

  it('409 LAST_OWNER from kick shows inline error', async () => {
    makeOwnerSettingsWithMembers([
      { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
      { playerId: 'player_2', name: 'Alice', role: 'owner', joinedAt: '' },
    ])
    // First call: groups list; second call: members; third call: kick returns 409
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('owner'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [
        { playerId: selfId, name: 'Me', role: 'owner', joinedAt: '' },
        { playerId: 'player_2', name: 'Alice', role: 'owner', joinedAt: '' },
      ]}) })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ code: 'LAST_OWNER', message: 'Cannot remove the last owner' }),
      })

    renderGroupSettings('grp_1', 'owner')

    await waitFor(() => {
      expect(screen.getByTestId('member-row-player_2')).toBeInTheDocument()
    })

    const aliceRow = screen.getByTestId('member-row-player_2')
    fireEvent.click(aliceRow.querySelector('[data-testid="kick-button"]') as HTMLElement)
    await waitFor(() => expect(screen.getByTestId('kick-confirm-button')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('kick-confirm-button'))

    await waitFor(() => {
      expect(screen.getByTestId('last-owner-error')).toBeInTheDocument()
    })
  })
})

// ── P1.6: Group config (rename + match format) ────────────────────────────────

describe('GroupSettings — P1.6 group config', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders group-name-input and group-name-save inside the owner section', async () => {
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('owner'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('group-name-input')).toBeInTheDocument()
      expect(screen.getByTestId('group-name-save')).toBeInTheDocument()
    })
  })

  it('renders match-format-select inside the owner section', async () => {
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('owner'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('match-format-select')).toBeInTheDocument()
    })
  })

  it('saving a new group name calls PATCH /player/groups/:groupId with name', async () => {
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('owner'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'grp_1', name: 'Renamed', defaultMatchFormat: 'singles' }) })

    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('group-name-input')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('group-name-input'), { target: { value: 'Renamed' } })
    fireEvent.click(screen.getByTestId('group-name-save'))

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/player/groups/grp_1') && !url.includes('/members')
      )
      expect(call).toBeDefined()
      expect(call[1]).toMatchObject({ method: 'PATCH' })
      const body = JSON.parse(call[1].body)
      expect(body.name).toBe('Renamed')
    })
  })

  it('changing match format calls PATCH /player/groups/:groupId with defaultMatchFormat', async () => {
    mockFetch
      .mockResolvedValueOnce(makeGroupsResponse('owner'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'grp_1', name: 'Pickleball Crew', defaultMatchFormat: 'doubles' }) })

    renderGroupSettings('grp_1', 'owner')
    await waitFor(() => {
      expect(screen.getByTestId('match-format-select')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByTestId('match-format-select'), { target: { value: 'doubles' } })

    await waitFor(() => {
      const call = mockFetch.mock.calls.find(
        ([url]: [string]) => typeof url === 'string' && url.includes('/player/groups/grp_1') && !url.includes('/members')
      )
      expect(call).toBeDefined()
      expect(call[1]).toMatchObject({ method: 'PATCH' })
      const body = JSON.parse(call[1].body)
      expect(body.defaultMatchFormat).toBe('doubles')
    })
  })

  it('does not show owner controls to members', async () => {
    mockFetch.mockResolvedValue(makeGroupsResponse('member'))
    renderGroupSettings('grp_1', 'member')
    await waitFor(() => {
      expect(screen.queryByTestId('manage-members-list')).not.toBeInTheDocument()
      expect(screen.queryByTestId('group-name-input')).not.toBeInTheDocument()
      expect(screen.queryByTestId('match-format-select')).not.toBeInTheDocument()
    })
  })
})
