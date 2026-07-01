/**
 * P2.4 — Notifications stream + read semantics (unit tests)
 *
 * RED: verifies the Notifications page renders message history from the API,
 * calls mark-read on mount, and handles loading/empty/error states.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Notifications } from '../../pages/Notifications'

const sampleMessages = [
  {
    id: 'msg-1',
    body: "You've been promoted to owner in a group",
    type: 'system',
    createdAt: '2026-06-30T10:00:00Z',
  },
  {
    id: 'msg-2',
    body: "You've been removed from a group",
    type: 'system',
    createdAt: '2026-06-30T11:00:00Z',
  },
]

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0
  global.fetch = jest.fn().mockImplementation(() => {
    const r = responses[call] ?? responses[responses.length - 1]
    call++
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    } as unknown as Response)
  })
}

function renderPage() {
  localStorage.setItem('auth_token', 'test-tok')
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Notifications />
    </MemoryRouter>
  )
}

describe('P2.4 — Notifications page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    delete (global as any).fetch
  })

  it('renders the page container', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('notifications-page')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
  })

  it('renders notification cards after loading', async () => {
    mockFetch([
      { status: 200, body: { messages: sampleMessages } },
      { status: 200, body: { ok: true } }, // mark-read
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getAllByTestId('notification-card')).toHaveLength(2)
    })
  })

  it('renders message body in each NotificationCard', async () => {
    mockFetch([
      { status: 200, body: { messages: sampleMessages } },
      { status: 200, body: { ok: true } },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText("You've been promoted to owner in a group")).toBeInTheDocument()
    })
  })

  it('calls mark-read on mount (POST /player/notifications/read)', async () => {
    mockFetch([
      { status: 200, body: { messages: sampleMessages } },
      { status: 200, body: { ok: true } },
    ])
    renderPage()
    await waitFor(() => {
      const fetchMock = global.fetch as jest.Mock
      const markReadCall = fetchMock.mock.calls.find(
        (call: string[]) => call[0] === '/player/notifications/read'
      )
      expect(markReadCall).toBeDefined()
    })
  })

  it('shows empty state when no messages', async () => {
    mockFetch([
      { status: 200, body: { messages: [] } },
      { status: 200, body: { ok: true } },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })

  it('renders stream container with aria-live', async () => {
    mockFetch([
      { status: 200, body: { messages: sampleMessages } },
      { status: 200, body: { ok: true } },
    ])
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('log')).toBeInTheDocument()
    })
  })
})
