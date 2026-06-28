/**
 * G2.5 — My Groups tab + Group page RTL tests (RED phase)
 *
 * Tests cover:
 * - GroupList renders groups with names
 * - GroupChatPanel renders message cards "Name · time"
 * - GroupChatPanel distinguishes two senders by name
 * - MembersPanel renders member list
 * - MyGroupsNavBadge shows unread badge count
 * - MyGroupsNavBadge renders nothing when count is 0
 * - Invite form is visible
 * - System events render differently
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupList } from '../../pages/MyGroups'
import { GroupChatPanel } from '../../components/GroupChatPanel'
import { MembersPanel } from '../../components/GroupChatPanel'
import { MyGroupsUnreadBadge } from '../../components/GroupChatPanel'
import { clearGroupMessageStores } from '../../hooks/useGroupMessages'

// ── Fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch

window.HTMLElement.prototype.scrollIntoView = jest.fn()

// ── Mock ReconnectingEventSource (SSE not available in jsdom) ────────────────
jest.mock('reconnecting-eventsource', () => {
  return jest.fn().mockImplementation(() => ({
    addEventListener: jest.fn(),
    close: jest.fn(),
  }))
})

// ── Auth mock ────────────────────────────────────────────────────────────────
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'acc_1', role: 'player', playerId: 'player_1', email: 'p@e.com' },
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeGroup = (overrides: Record<string, unknown> = {}) => ({
  id: 'grp_1',
  name: 'Pickleball Crew',
  role: 'owner',
  memberCount: 4,
  ...overrides,
})

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  conversationId: 'conv_1',
  playerId: 'player_2',
  senderName: 'Alice Smith',
  body: 'Hey everyone!',
  type: 'text',
  createdAt: new Date('2026-06-01T10:00:00Z').toISOString(),
  removedAt: null,
  ...overrides,
})

const makeMember = (overrides: Record<string, unknown> = {}) => ({
  playerId: 'player_1',
  name: 'Bob Jones',
  role: 'owner',
  joinedAt: new Date('2026-06-01T09:00:00Z').toISOString(),
  ...overrides,
})

// ============================================================================
// GroupList
// ============================================================================

describe('GroupList', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [] }),
    })
  })

  it('renders "No groups yet" when list is empty', async () => {
    render(
      <MemoryRouter>
        <GroupList />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByTestId('group-list-empty')).toBeInTheDocument()
    })
  })

  it('renders group names from API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [makeGroup(), makeGroup({ id: 'grp_2', name: 'Tennis Regulars' })] }),
    })

    render(
      <MemoryRouter>
        <GroupList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Pickleball Crew')).toBeInTheDocument()
      expect(screen.getByText('Tennis Regulars')).toBeInTheDocument()
    })
  })

  it('renders group items with correct data-testid', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [makeGroup(), makeGroup({ id: 'grp_2', name: 'Second Group' })] }),
    })

    render(
      <MemoryRouter>
        <GroupList />
      </MemoryRouter>
    )

    await waitFor(() => {
      const items = screen.getAllByTestId('group-list-item')
      expect(items).toHaveLength(2)
    })
  })

  it('shows error state when fetch fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ message: 'Unauthorized' }) })

    render(
      <MemoryRouter>
        <GroupList />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('group-list-error')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// GroupChatPanel — message cards "Name · time"
// ============================================================================

describe('GroupChatPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearGroupMessageStores()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    })
  })

  it('renders chat panel container', async () => {
    render(<GroupChatPanel groupId="grp_1" />)
    expect(screen.getByTestId('group-chat-panel')).toBeInTheDocument()
  })

  it('shows "No messages yet" when empty', async () => {
    render(<GroupChatPanel groupId="grp_1" />)
    await waitFor(() => {
      expect(screen.getByText('No messages yet')).toBeInTheDocument()
    })
  })

  it('renders message card with "Name · time" format', async () => {
    const msg = makeMessage()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [msg] }),
    })

    render(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('group-message-item')).toBeInTheDocument()
      expect(screen.getByText('Hey everyone!')).toBeInTheDocument()
      // "Name · time" pattern
      expect(screen.getByText(/Alice Smith\s*·/)).toBeInTheDocument()
    })
  })

  it('renders two messages from different senders with distinguishable names', async () => {
    const msgs = [
      makeMessage({ id: 'msg_a', body: 'Hello', senderName: 'Alice Smith' }),
      makeMessage({ id: 'msg_b', body: 'Hi back', senderName: 'Bob Jones' }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: msgs }),
    })

    render(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByText(/Alice Smith/)).toBeInTheDocument()
      expect(screen.getByText(/Bob Jones/)).toBeInTheDocument()
    })
  })

  it('renders system events differently (italic style data-testid)', async () => {
    const sysMsg = makeMessage({
      id: 'sys_1',
      type: 'system',
      playerId: null,
      senderName: null,
      body: 'Sam joined',
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [sysMsg] }),
    })

    render(<GroupChatPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('group-system-event')).toBeInTheDocument()
      expect(screen.getByText('Sam joined')).toBeInTheDocument()
    })
  })

  it('renders the message input and send button', () => {
    render(<GroupChatPanel groupId="grp_1" />)
    expect(screen.getByTestId('group-message-input')).toBeInTheDocument()
    expect(screen.getByTestId('group-message-send-button')).toBeInTheDocument()
  })

  it('submits a message and clears the input', async () => {
    const returned = makeMessage({ id: 'msg_new', body: 'Hi group', senderName: 'Me' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => returned })

    render(<GroupChatPanel groupId="grp_1" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    const input = screen.getByTestId('group-message-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Hi group' } })
    fireEvent.click(screen.getByTestId('group-message-send-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/messages'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(input.value).toBe('')
    })
  })

  it('shows error when send fails', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [] }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Send failed' }) })

    render(<GroupChatPanel groupId="grp_1" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    const input = screen.getByTestId('group-message-input')
    fireEvent.change(input, { target: { value: 'oops' } })
    fireEvent.click(screen.getByTestId('group-message-send-button'))

    await waitFor(() => {
      expect(screen.getByText('Send failed')).toBeInTheDocument()
    })
  })
})

// ============================================================================
// MembersPanel
// ============================================================================

describe('MembersPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ members: [] }),
    })
  })

  it('renders members panel container', async () => {
    render(<MembersPanel groupId="grp_1" />)
    expect(screen.getByTestId('members-panel')).toBeInTheDocument()
  })

  it('renders member names from API', async () => {
    const members = [
      makeMember({ playerId: 'player_1', name: 'Bob Jones', role: 'owner' }),
      makeMember({ playerId: 'player_2', name: 'Alice Smith', role: 'member' }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ members }),
    })

    render(<MembersPanel groupId="grp_1" />)

    await waitFor(() => {
      expect(screen.getByText('Bob Jones')).toBeInTheDocument()
      expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    })
  })

  it('renders member items with correct data-testid', async () => {
    const members = [
      makeMember({ playerId: 'player_1', name: 'Bob' }),
      makeMember({ playerId: 'player_2', name: 'Alice' }),
    ]
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ members }),
    })

    render(<MembersPanel groupId="grp_1" />)

    await waitFor(() => {
      const items = screen.getAllByTestId('member-item')
      expect(items).toHaveLength(2)
    })
  })

  it('renders invite form within the panel', () => {
    render(<MembersPanel groupId="grp_1" />)
    expect(screen.getByTestId('invite-email-input')).toBeInTheDocument()
    expect(screen.getByTestId('invite-send-button')).toBeInTheDocument()
  })

  it('submits invite email via fetch', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ members: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })

    render(<MembersPanel groupId="grp_1" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    const emailInput = screen.getByTestId('invite-email-input') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByTestId('invite-send-button'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/player/groups/grp_1/invites'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })
})

// ============================================================================
// MyGroupsUnreadBadge
// ============================================================================

describe('MyGroupsUnreadBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(<MyGroupsUnreadBadge count={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the badge with count when greater than 0', () => {
    render(<MyGroupsUnreadBadge count={3} />)
    const badge = screen.getByTestId('groups-unread-badge')
    expect(badge).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows "99+" for counts over 99', () => {
    render(<MyGroupsUnreadBadge count={150} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
  })
})
