/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Login } from '../Login'
import { Signup } from '../Signup'
import { ForgotPassword } from '../ForgotPassword'
import { ResetPassword } from '../ResetPassword'
import { Landing } from '../Landing'

jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

import { useAuth } from '../../hooks/useAuth'

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

const renderWithRouter = (ui: React.ReactElement) => render(<BrowserRouter>{ui}</BrowserRouter>)

// ISSUE-22: page titles and descriptions take no trailing full stop, app-wide,
// with no exceptions. Scope is titles/descriptions only — body paragraphs and
// error/success sentences keep their own punctuation (see the ResetPassword
// success-state test below, which deliberately does not sweep the redirect
// sentence).
describe('Page copy convention — no trailing period on titles/descriptions (ISSUE-22)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
      login: jest.fn(),
      signup: jest.fn(),
    } as any)
  })

  it('Login: headline and subtitle carry no trailing period', () => {
    renderWithRouter(<Login />)

    expect(screen.getByText('Sign in')).toBeInTheDocument()
    expect(screen.getByText('Sign in')).not.toHaveTextContent(/\.$/)
    const subtitle = screen.getByText("See your matches, standings, and tonight's tournaments")
    expect(subtitle).not.toHaveTextContent(/\.$/)
  })

  it('Signup: title and description carry no trailing period (already compliant)', () => {
    renderWithRouter(<Signup />)

    expect(screen.getByText('Create account')).not.toHaveTextContent(/\.$/)
    expect(screen.getByText('Join the tournament')).not.toHaveTextContent(/\.$/)
  })

  it('Landing: hero heading and tagline carry no trailing period', () => {
    renderWithRouter(<Landing />)

    expect(screen.getByText('See you at the court')).not.toHaveTextContent(/\.$/)
    expect(screen.getByText(/Find drop-in nights/)).not.toHaveTextContent(/\.$/)
  })

  it('ForgotPassword: default-state title and description carry no trailing period', () => {
    renderWithRouter(<ForgotPassword />)

    expect(screen.getByText('Reset your password')).not.toHaveTextContent(/\.$/)
    expect(screen.getByText(/Enter your email address/)).not.toHaveTextContent(/\.$/)
  })

  it('ForgotPassword: success-state title and description carry no trailing period', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any

    renderWithRouter(<ForgotPassword />)
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.click(screen.getByText('Send reset code'))

    await waitFor(() => expect(screen.getByText('✓ Code sent')).toBeInTheDocument())

    expect(screen.getByText('✓ Code sent')).not.toHaveTextContent(/\.$/)
    expect(screen.getByText(/We've sent a 6-digit code/)).not.toHaveTextContent(/\.$/)
  })

  it('ResetPassword: default-state title and description carry no trailing period', () => {
    renderWithRouter(<ResetPassword />)

    expect(screen.getByText('Reset your password')).not.toHaveTextContent(/\.$/)
    expect(screen.getByText(/Enter the code we sent/)).not.toHaveTextContent(/\.$/)
  })

  it('ResetPassword: success-state title carries no trailing period; the redirect sentence below keeps its own punctuation', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any

    renderWithRouter(<ResetPassword />)
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Reset code'), { target: { value: '123456' } })
    fireEvent.change(screen.getByPlaceholderText('Enter a new password'), {
      target: { value: 'newpass123' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), {
      target: { value: 'newpass123' },
    })
    fireEvent.click(screen.getByText('Update password'))

    await waitFor(() => expect(screen.getByText('Password updated')).toBeInTheDocument())

    expect(screen.getByText('Password updated')).not.toHaveTextContent(/\.$/)
    // Not swept by ISSUE-22 — a body sentence with real punctuation, not a title/description.
    expect(screen.getByText(/Redirecting to login/)).toBeInTheDocument()
  })
})

// ISSUE-37: Login, ForgotPassword and ResetPassword had zero <h1> elements —
// their 34px titles were styled <div>s, so a screen reader got no page
// heading on three of five auth screens and heading navigation skipped them
// entirely. Signup and Landing already used a real <h1> (verified, untouched
// here). Each page has two mutually-exclusive render states (default vs.
// success, gated by an early `if (successState) return (...)`), so both are
// checked to confirm neither ever renders two <h1>s at once.
describe('Auth pages expose exactly one <h1> per screen (ISSUE-37)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      loading: false,
      login: jest.fn(),
      signup: jest.fn(),
    } as any)
  })

  it('Login has exactly one <h1>, reading "Sign in"', () => {
    renderWithRouter(<Login />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Sign in')
  })

  it('ForgotPassword default state has exactly one <h1>', () => {
    renderWithRouter(<ForgotPassword />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Reset your password')
  })

  it('ForgotPassword success state has exactly one <h1>', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any

    renderWithRouter(<ForgotPassword />)
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.click(screen.getByText('Send reset code'))
    await waitFor(() => expect(screen.getByText('✓ Code sent')).toBeInTheDocument())

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Code sent')
  })

  it('ResetPassword default state has exactly one <h1>', () => {
    renderWithRouter(<ResetPassword />)

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Reset your password')
  })

  it('ResetPassword success state has exactly one <h1>', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any

    renderWithRouter(<ResetPassword />)
    fireEvent.change(screen.getByPlaceholderText('Enter your email'), {
      target: { value: 'player@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Reset code'), { target: { value: '123456' } })
    fireEvent.change(screen.getByPlaceholderText('Enter a new password'), {
      target: { value: 'newpass123' },
    })
    fireEvent.change(screen.getByPlaceholderText('Confirm your password'), {
      target: { value: 'newpass123' },
    })
    fireEvent.click(screen.getByText('Update password'))
    await waitFor(() => expect(screen.getByText('Password updated')).toBeInTheDocument())

    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Password updated')
  })
})
