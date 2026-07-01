/**
 * P2.3 — Header bell + /notifications route (unit tests)
 *
 * RED: these tests verify the notification bell and unread badge behavior.
 * They will FAIL until useNotificationUnread and the bell UI are implemented.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as useAuthHook from '../../hooks/useAuth'

// Helper: renders the BottomNav-equivalent component that includes the bell
// We test via the ResponsiveLayout since the bell lives in the header/nav
import { ResponsiveLayout } from '../../components/shared/ResponsiveLayout'

function mockAuth(authenticated: boolean) {
  jest.spyOn(useAuthHook, 'useAuth').mockReturnValue({
    user: authenticated
      ? { id: 'p-1', email: 'test@test.com', role: 'player', name: 'Test Player' }
      : null,
    isAuthenticated: authenticated,
    loading: false,
    login: jest.fn(),
    logout: jest.fn(),
    signup: jest.fn(),
  } as any)
}

function mockFetch(unread: number) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ unread }),
  } as unknown as Response)
}

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/browse']}>
      <ResponsiveLayout>
        <div>content</div>
      </ResponsiveLayout>
    </MemoryRouter>
  )
}

describe('P2.3 — Notification bell', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // suppress noise
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any)
  })

  afterEach(() => {
    delete (global as any).fetch
  })

  it('renders the notification bell link when authenticated', async () => {
    mockAuth(true)
    mockFetch(0)
    renderLayout()
    await waitFor(() => {
      expect(screen.getByTestId('nav-notifications')).toBeInTheDocument()
    })
  })

  it('bell links to /notifications', async () => {
    mockAuth(true)
    mockFetch(0)
    renderLayout()
    await waitFor(() => {
      const link = screen.getByTestId('nav-notifications')
      expect(link).toHaveAttribute('href', '/notifications')
    })
  })

  it('does not render bell when not authenticated', () => {
    mockAuth(false)
    renderLayout()
    expect(screen.queryByTestId('nav-notifications')).toBeNull()
  })

  it('shows unread count badge when there are unread notifications', async () => {
    mockAuth(true)
    mockFetch(3)
    renderLayout()
    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toBeInTheDocument()
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('3')
    })
  })

  it('hides badge when unread count is 0', async () => {
    mockAuth(true)
    mockFetch(0)
    renderLayout()
    // Small wait to ensure fetch resolves
    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).toBeNull()
    })
  })
})
