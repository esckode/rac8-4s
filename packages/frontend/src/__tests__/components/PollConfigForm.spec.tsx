/**
 * P3.6 RED — PollConfigForm unit tests
 *
 * PollConfigForm is used when creating a poll. It provides:
 *   - Auto-close datetime picker (optional)
 *   - Auto-launch toggle (disabled until a close time is set)
 *   - Min-players number input (only shown when auto-launch is on)
 *   - Match format selector (singles/doubles, only shown when auto-launch is on)
 *
 * Output: calls onChange with a PollConfig object whenever any field changes.
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PollConfigForm, type PollConfig } from '../../components/PollConfigForm'

function makePollConfig(overrides: Partial<PollConfig> = {}): PollConfig {
  return {
    autoCloseAt: null,
    autoLaunch: false,
    minPlayers: null,
    launchMatchFormat: null,
    ...overrides,
  }
}

describe('PollConfigForm', () => {
  it('renders without crashing', () => {
    render(<PollConfigForm value={makePollConfig()} onChange={jest.fn()} />)
    expect(screen.getByTestId('poll-config-form')).toBeInTheDocument()
  })

  it('renders the auto-close datetime picker', () => {
    render(<PollConfigForm value={makePollConfig()} onChange={jest.fn()} />)
    expect(screen.getByTestId('poll-auto-close-input')).toBeInTheDocument()
  })

  it('auto-launch toggle is disabled when no close time is set', () => {
    render(<PollConfigForm value={makePollConfig({ autoCloseAt: null })} onChange={jest.fn()} />)
    const toggle = screen.getByTestId('poll-auto-launch-toggle')
    expect(toggle).toBeDisabled()
  })

  it('auto-launch toggle is enabled when close time is set', () => {
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z' })}
        onChange={jest.fn()}
      />,
    )
    const toggle = screen.getByTestId('poll-auto-launch-toggle')
    expect(toggle).not.toBeDisabled()
  })

  it('min-players input is hidden when auto-launch is off', () => {
    render(<PollConfigForm value={makePollConfig({ autoLaunch: false })} onChange={jest.fn()} />)
    expect(screen.queryByTestId('poll-min-players-input')).toBeNull()
  })

  it('min-players input is shown when auto-launch is on', () => {
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z', autoLaunch: true })}
        onChange={jest.fn()}
      />,
    )
    expect(screen.getByTestId('poll-min-players-input')).toBeInTheDocument()
  })

  it('match format selector is hidden when auto-launch is off', () => {
    render(<PollConfigForm value={makePollConfig({ autoLaunch: false })} onChange={jest.fn()} />)
    expect(screen.queryByTestId('poll-launch-format-select')).toBeNull()
  })

  it('match format selector is shown when auto-launch is on', () => {
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z', autoLaunch: true })}
        onChange={jest.fn()}
      />,
    )
    expect(screen.getByTestId('poll-launch-format-select')).toBeInTheDocument()
  })

  it('calls onChange with updated autoCloseAt when datetime input changes', () => {
    const onChange = jest.fn()
    render(<PollConfigForm value={makePollConfig()} onChange={onChange} />)
    const input = screen.getByTestId('poll-auto-close-input')
    fireEvent.change(input, { target: { value: '2026-07-10T18:00' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoCloseAt: expect.stringContaining('2026-07-10') }),
    )
  })

  it('calls onChange with autoLaunch=true when toggle is clicked (with close time set)', () => {
    const onChange = jest.fn()
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z', autoLaunch: false })}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByTestId('poll-auto-launch-toggle'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoLaunch: true }))
  })

  it('calls onChange with updated minPlayers', () => {
    const onChange = jest.fn()
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z', autoLaunch: true, minPlayers: null })}
        onChange={onChange}
      />,
    )
    const input = screen.getByTestId('poll-min-players-input')
    fireEvent.change(input, { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minPlayers: 4 }))
  })

  it('calls onChange with updated launchMatchFormat', () => {
    const onChange = jest.fn()
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z', autoLaunch: true })}
        onChange={onChange}
      />,
    )
    const select = screen.getByTestId('poll-launch-format-select')
    fireEvent.change(select, { target: { value: 'doubles' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ launchMatchFormat: 'doubles' }))
  })

  it('clears autoLaunch when autoCloseAt is cleared', () => {
    const onChange = jest.fn()
    render(
      <PollConfigForm
        value={makePollConfig({ autoCloseAt: '2026-07-10T18:00:00.000Z', autoLaunch: true })}
        onChange={onChange}
      />,
    )
    const input = screen.getByTestId('poll-auto-close-input')
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ autoCloseAt: null, autoLaunch: false }),
    )
  })
})
