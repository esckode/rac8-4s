/**
 * P3.7 RED — LaunchConfirmSheet unit tests
 *
 * LaunchConfirmSheet is a modal confirmation sheet that shows:
 *   - A list of in-voters by name (seed preview)
 *   - A format toggle (singles/doubles), defaulting to the group's default
 *   - A "Confirm Launch" button
 *   - A "Cancel" button
 *
 * Props:
 *   inVoterNames: string[]        — names of players who voted "in"
 *   defaultFormat?: 'singles' | 'doubles'  — pre-selected format
 *   onConfirm: (opts: { matchFormat: string }) => void
 *   onCancel: () => void
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LaunchConfirmSheet, type LaunchConfirmSheetProps } from '../../components/LaunchConfirmSheet'

function makeProps(overrides: Partial<LaunchConfirmSheetProps> = {}): LaunchConfirmSheetProps {
  return {
    inVoterNames: ['Alice', 'Bob', 'Carol'],
    defaultFormat: 'singles',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    ...overrides,
  }
}

describe('LaunchConfirmSheet', () => {
  it('renders the sheet container', () => {
    render(<LaunchConfirmSheet {...makeProps()} />)
    expect(screen.getByTestId('launch-confirm-sheet')).toBeInTheDocument()
  })

  it('renders each in-voter name', () => {
    render(<LaunchConfirmSheet {...makeProps({ inVoterNames: ['Alice', 'Bob', 'Carol'] })} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
  })

  it('renders the format selector with the default format pre-selected', () => {
    render(<LaunchConfirmSheet {...makeProps({ defaultFormat: 'doubles' })} />)
    const select = screen.getByTestId('launch-format-select') as HTMLSelectElement
    expect(select.value).toBe('doubles')
  })

  it('defaults to singles when defaultFormat is not provided', () => {
    render(<LaunchConfirmSheet {...makeProps({ defaultFormat: undefined })} />)
    const select = screen.getByTestId('launch-format-select') as HTMLSelectElement
    expect(select.value).toBe('singles')
  })

  it('renders Confirm Launch and Cancel buttons', () => {
    render(<LaunchConfirmSheet {...makeProps()} />)
    expect(screen.getByTestId('launch-confirm-button')).toBeInTheDocument()
    expect(screen.getByTestId('launch-cancel-button')).toBeInTheDocument()
  })

  it('calls onConfirm with selected matchFormat when Confirm is clicked', async () => {
    const onConfirm = jest.fn()
    render(<LaunchConfirmSheet {...makeProps({ onConfirm, defaultFormat: 'singles' })} />)

    const select = screen.getByTestId('launch-format-select')
    fireEvent.change(select, { target: { value: 'doubles' } })

    await userEvent.click(screen.getByTestId('launch-confirm-button'))
    expect(onConfirm).toHaveBeenCalledWith({ matchFormat: 'doubles' })
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = jest.fn()
    render(<LaunchConfirmSheet {...makeProps({ onCancel })} />)
    await userEvent.click(screen.getByTestId('launch-cancel-button'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows "No in-voters yet" when list is empty', () => {
    render(<LaunchConfirmSheet {...makeProps({ inVoterNames: [] })} />)
    expect(screen.getByTestId('launch-no-voters')).toBeInTheDocument()
  })
})
