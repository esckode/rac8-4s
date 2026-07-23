import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotificationCard } from '../NotificationCard'

const baseMessage = {
  id: 'msg-1',
  body: "You've been promoted to owner in a group",
  type: 'system',
  createdAt: '2026-06-30T10:00:00Z',
}

function renderCard(message: typeof baseMessage & { metadata?: { groupId?: string; registrationId?: string } | null }) {
  return render(
    <MemoryRouter>
      <NotificationCard message={message} />
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
})
