/**
 * Tests for the login 429 rate-limit UI (P0.2, BACKLOG.md FE-GAP-1).
 * Verifies: 429 shows "Too many attempts", a ticking countdown seeded from
 * retryAfterSeconds, and disabled form fields until it reaches zero.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Login } from '../../pages/Login'

const mockLogin = jest.fn()
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ login: mockLogin }),
}))

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/browse" element={<div>Browse</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText(/enter your email/i), { target: { value: 'alice@example.com' } })
  fireEvent.change(screen.getByPlaceholderText(/enter your password/i), { target: { value: 'wrongpassword' } })
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('Login rate-limit UI (P0.2)', () => {
  beforeEach(() => jest.resetAllMocks())

  it('shows "Too many attempts" and a countdown seeded from retryAfterSeconds on a 429', async () => {
    const err = Object.assign(new Error('Too many attempts. Try again later.'), {
      status: 429,
      retryAfterSeconds: 900,
    })
    mockLogin.mockRejectedValueOnce(err)

    renderLogin()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByTestId('login-rate-limit-error')).toBeInTheDocument())
    expect(screen.getByTestId('login-retry-countdown')).toHaveTextContent('15:00')
  })

  it('disables the form fields while the countdown is running', async () => {
    const err = Object.assign(new Error('Too many attempts. Try again later.'), {
      status: 429,
      retryAfterSeconds: 900,
    })
    mockLogin.mockRejectedValueOnce(err)

    renderLogin()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByTestId('login-retry-countdown')).toBeInTheDocument())
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeDisabled()
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
  })

  it('ticks the countdown down and re-enables the form at zero', async () => {
    jest.useFakeTimers()
    const err = Object.assign(new Error('Too many attempts. Try again later.'), {
      status: 429,
      retryAfterSeconds: 2,
    })
    mockLogin.mockRejectedValueOnce(err)

    renderLogin()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByTestId('login-retry-countdown')).toHaveTextContent('0:02'))

    await act(async () => {
      jest.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('login-retry-countdown')).toHaveTextContent('0:01')

    await act(async () => {
      jest.advanceTimersByTime(1000)
    })
    expect(screen.queryByTestId('login-retry-countdown')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your email/i)).not.toBeDisabled()

    jest.useRealTimers()
  })
})
