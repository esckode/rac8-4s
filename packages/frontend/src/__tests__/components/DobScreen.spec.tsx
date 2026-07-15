/**
 * RTL tests for the DobScreen component (18+ age gate — neutral DOB entry).
 *
 * Requirements (per G0.1):
 *  - Renders a date input, NOT a checkbox "I am 18+"
 *  - Under-18 DOB → blocked with a clear message (no progression)
 *  - 18+ DOB → calls onConfirm with the attestation
 *  - No raw DOB is emitted beyond the callback (the component itself does not
 *    store or display it after calling onConfirm)
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { DobScreen } from '../../pages/DobScreen'

/** ISO date string for someone N years old today. */
function dobForAge(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

describe('DobScreen', () => {
  const onConfirm = jest.fn()
  const onBack = jest.fn()

  beforeEach(() => {
    onConfirm.mockClear()
    onBack.mockClear()
  })

  // ── Renders a neutral DOB screen ──────────────────────────────────────────

  it('renders a date input (not a checkbox)', () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)

    const dateInput = screen.getByTestId('dob-input')
    expect(dateInput).toBeInTheDocument()
    expect(dateInput.tagName).toBe('INPUT')
    expect(dateInput).toHaveAttribute('type', 'date')

    // Must NOT render any "I am 18" checkbox
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  // S9.1 — the "Privacy Policy" text is a working link to /privacy, not a dead span.
  it('links "Privacy Policy" to /privacy', () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)

    const link = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(link).toHaveAttribute('href', '/privacy')
  })

  it('renders a continue / confirm button', () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)
    expect(screen.getByTestId('dob-submit')).toBeInTheDocument()
  })

  it('renders the screen title and 18+ notice', () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)
    // Some form of "date of birth" heading
    expect(screen.getByTestId('dob-heading')).toBeInTheDocument()
    // 18+ requirement text
    expect(screen.getByTestId('dob-age-notice')).toBeInTheDocument()
  })

  // ── Under-18: blocked ─────────────────────────────────────────────────────

  it('shows a blocking error message for an under-18 DOB', async () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)

    const input = screen.getByTestId('dob-input')
    fireEvent.change(input, { target: { value: dobForAge(15) } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('dob-error')).toBeInTheDocument()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('shows a blocking error for a DOB one day short of 18', async () => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 18)
    d.setDate(d.getDate() + 1) // not yet 18
    const dob = d.toISOString().slice(0, 10)

    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)

    const input = screen.getByTestId('dob-input')
    fireEvent.change(input, { target: { value: dob } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('dob-error')).toBeInTheDocument()
    })
    expect(onConfirm).not.toHaveBeenCalled()
  })

  // ── 18+: proceeds ────────────────────────────────────────────────────────

  it('calls onConfirm with AgeAttestation when DOB is 18+ years ago', async () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)

    const input = screen.getByTestId('dob-input')
    fireEvent.change(input, { target: { value: dobForAge(25) } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    const attestation = onConfirm.mock.calls[0][0]
    expect(attestation).toHaveProperty('dateOfBirth')
    expect(attestation).toHaveProperty('policyVersion')
    expect(typeof attestation.dateOfBirth).toBe('string')
    // No error displayed
    expect(screen.queryByTestId('dob-error')).toBeNull()
  })

  it('accepts a DOB of exactly 18 years ago today', async () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)

    const input = screen.getByTestId('dob-input')
    fireEvent.change(input, { target: { value: dobForAge(18) } })
    fireEvent.click(screen.getByTestId('dob-submit'))

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })

  // ── Back navigation ───────────────────────────────────────────────────────

  it('calls onBack when the back button is pressed', () => {
    render(<MemoryRouter><DobScreen onConfirm={onConfirm} onBack={onBack} /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('dob-back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
