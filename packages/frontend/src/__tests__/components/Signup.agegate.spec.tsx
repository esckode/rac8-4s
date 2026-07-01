/**
 * Tests for the age-gate (P1.8) overlay wired into the Signup page.
 * Verifies: AGE_ATTESTATION_REQUIRED → DobScreen; UNDERAGE → terminal; re-submit with attestation.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Signup } from '../../pages/Signup'

const mockSignup = jest.fn()
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ signup: mockSignup }),
}))

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/browse" element={<div>Browse</div>} />
      </Routes>
    </MemoryRouter>
  )
}

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'alice@example.com' } })
  fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: 'Alice' } })
  const [pwField, cpwField] = screen.getAllByDisplayValue('')
  fireEvent.change(pwField, { target: { value: 'password123' } })
  fireEvent.change(cpwField, { target: { value: 'password123' } })
  fireEvent.click(screen.getByRole('button', { name: /create account/i }))
}

describe('Signup age-gate (P1.8)', () => {
  beforeEach(() => jest.resetAllMocks())

  it('shows DobScreen when signup returns AGE_ATTESTATION_REQUIRED', async () => {
    const err = Object.assign(new Error('Age required'), { code: 'AGE_ATTESTATION_REQUIRED' })
    mockSignup.mockRejectedValueOnce(err)

    renderSignup()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByTestId('dob-heading')).toBeInTheDocument())
  })

  it('re-submits with dob_attestation when DobScreen confirms', async () => {
    const err = Object.assign(new Error('Age required'), { code: 'AGE_ATTESTATION_REQUIRED' })
    mockSignup.mockRejectedValueOnce(err).mockResolvedValueOnce(undefined)

    renderSignup()
    fillAndSubmit()
    await waitFor(() => screen.getByTestId('dob-heading'))

    fireEvent.change(screen.getByTestId('dob-input'), { target: { value: '2000-01-01' } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() =>
      expect(mockSignup).toHaveBeenCalledTimes(2)
    )
    const [,,,, attestation] = mockSignup.mock.calls[1]
    expect(attestation).toMatchObject({ dateOfBirth: '2000-01-01' })
  })

  it('shows terminal underage message on UNDERAGE', async () => {
    const err = Object.assign(new Error('Underage'), { code: 'UNDERAGE' })
    mockSignup.mockRejectedValueOnce(err)

    renderSignup()
    fillAndSubmit()

    await waitFor(() =>
      expect(screen.getByTestId('signup-underage-error')).toBeInTheDocument()
    )
  })

  it('never shows DobScreen when signup succeeds', async () => {
    mockSignup.mockResolvedValueOnce(undefined)

    renderSignup()
    fillAndSubmit()

    await waitFor(() =>
      expect(screen.queryByTestId('dob-heading')).not.toBeInTheDocument()
    )
  })
})
