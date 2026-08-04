import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotificationCard } from '../NotificationCard'

// ISSUE-57: accepting an invite must navigate to the group.
const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

const baseMessage = {
  id: 'msg-1',
  body: "You've been promoted to owner in a group",
  type: 'system',
  createdAt: '2026-06-30T10:00:00Z',
}

type Metadata = {
  groupId?: string
  registrationId?: string
  groupName?: string
  groupInviteToken?: string
  inviteEmail?: string
}

function renderCard(
  message: typeof baseMessage & { metadata?: Metadata | null },
  onAccepted: () => void = jest.fn()
) {
  return render(
    <MemoryRouter>
      <NotificationCard message={message} onAccepted={onAccepted} />
    </MemoryRouter>
  )
}

describe('NotificationCard', () => {
  it('renders as a plain div with no metadata', () => {
    renderCard(baseMessage)
    const card = screen.getByTestId('notification-card')
    expect(card.tagName).toBe('DIV')
  })

  it('renders as a link to the group when metadata.groupId is present', () => {
    renderCard({ ...baseMessage, metadata: { groupId: 'group-123' } })
    const card = screen.getByTestId('notification-card')
    expect(card.tagName).toBe('A')
    expect(card).toHaveAttribute('href', '/groups/group-123')
  })

  it('still renders the body and timestamp when linked', () => {
    renderCard({ ...baseMessage, metadata: { groupId: 'group-123' } })
    expect(screen.getByText(baseMessage.body)).toBeInTheDocument()
  })

  it('renders as a link to the partner confirm page when metadata.registrationId is present (ISSUE-15)', () => {
    renderCard({
      ...baseMessage,
      body: 'Alice invited you to be their doubles partner for Summer Slam',
      metadata: { registrationId: 'reg-456' },
    })
    const card = screen.getByTestId('notification-card')
    expect(card.tagName).toBe('A')
    expect(card).toHaveAttribute('href', '/registrations/reg-456/confirm')
  })

  // ─── ISSUE-55: group-invite Accept button ────────────────────────────────

  const inviteMessage = {
    ...baseMessage,
    body: "You've been invited to join Pickleball Fundays",
    metadata: {
      groupId: 'group-789',
      groupName: 'Pickleball Fundays',
      groupInviteToken: 'invite-token-abc',
      inviteEmail: 'invitee@test.local',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    localStorage.clear()
    delete (global as any).fetch
  })

  it('renders an Accept button instead of a deep-link when metadata.groupInviteToken is present', () => {
    renderCard(inviteMessage)
    expect(screen.getByTestId('notification-invite-accept')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('posts the invite token + email to the accept endpoint and does not store the response token', async () => {
    localStorage.setItem('auth_token', 'my-session-token')
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, groupId: 'group-789', playerId: 'p1', token: 'DOWNGRADE-TOKEN' }),
    })
    const onAccepted = jest.fn()
    renderCard(inviteMessage, onAccepted)

    fireEvent.click(screen.getByTestId('notification-invite-accept'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/player/groups/group-789/invites/accept',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer my-session-token' }),
          body: JSON.stringify({ token: 'invite-token-abc', email: 'invitee@test.local' }),
        })
      )
    })

    await waitFor(() => expect(onAccepted).toHaveBeenCalled())
    expect(localStorage.getItem('auth_token')).toBe('my-session-token')
  })

  // ─── ISSUE-57: accepting navigates to the group ────────────────────────────

  it('navigates to the group on a successful accept', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, groupId: 'group-789', playerId: 'p1', token: 'DOWNGRADE-TOKEN' }),
    })
    renderCard(inviteMessage)

    fireEvent.click(screen.getByTestId('notification-invite-accept'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/groups/group-789')
    })
  })

  it('does NOT navigate when the token is no longer valid', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'TOKEN_INVALID', message: 'Token is invalid or has expired' }),
    })
    renderCard(inviteMessage)

    fireEvent.click(screen.getByTestId('notification-invite-accept'))

    await waitFor(() => {
      expect(screen.getByText('This invite is no longer valid')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('marks its own notification row read on successful accept (ISSUE-63)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, groupId: 'group-789', playerId: 'p1', token: 'DOWNGRADE-TOKEN' }),
    })
    renderCard(inviteMessage)

    fireEvent.click(screen.getByTestId('notification-invite-accept'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/player/notifications/msg-1/read',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('does not throw a hooks-order error when a non-invite notification renders after an invite one', () => {
    // ISSUE-57's own trap: useNavigate() must be called at the component's top
    // level, not inside the `if (groupInviteToken && groupId)` branch — doing
    // so throws "Rendered more hooks than during the previous render" the
    // moment a differently-shaped notification renders.
    const { rerender } = renderCard(inviteMessage)
    expect(() =>
      rerender(
        <MemoryRouter>
          <NotificationCard message={{ ...baseMessage, metadata: { groupId: 'group-123' } }} />
        </MemoryRouter>
      )
    ).not.toThrow()
  })

  it('shows an inline error and stays dismissible when the token is no longer valid', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'TOKEN_INVALID', message: 'Token is invalid or has expired' }),
    })
    renderCard(inviteMessage)

    fireEvent.click(screen.getByTestId('notification-invite-accept'))

    await waitFor(() => {
      expect(screen.getByText('This invite is no longer valid')).toBeInTheDocument()
    })
    expect(screen.getByTestId('notification-card')).toBeInTheDocument()
  })
})
