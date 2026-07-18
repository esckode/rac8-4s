import React from 'react'
import { render, screen, act } from '@testing-library/react'
import {
  OfflineSnapshotProvider,
  useOfflineSnapshot,
  notifyOfflineSnapshot,
  clearOfflineSnapshot,
} from '../OfflineSnapshotContext'

function Probe({ path }: { path: string }) {
  const { isOffline, updatedAtFor } = useOfflineSnapshot()
  return (
    <div>
      <span data-testid="is-offline">{String(isOffline)}</span>
      <span data-testid="updated-at">{updatedAtFor(path) ?? 'none'}</span>
    </div>
  )
}

describe('OfflineSnapshotContext', () => {
  const originalOnLine = window.navigator.onLine

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: originalOnLine, configurable: true })
  })

  it('defaults isOffline from navigator.onLine at mount', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })

    render(
      <OfflineSnapshotProvider>
        <Probe path="/player/tournaments" />
      </OfflineSnapshotProvider>
    )

    expect(screen.getByTestId('is-offline')).toHaveTextContent('true')
  })

  it('sets isOffline and records the timestamp on notifyOfflineSnapshot', () => {
    render(
      <OfflineSnapshotProvider>
        <Probe path="/player/tournaments" />
      </OfflineSnapshotProvider>
    )

    act(() => notifyOfflineSnapshot('/player/tournaments', '2026-07-18T10:30:00.000Z'))

    expect(screen.getByTestId('is-offline')).toHaveTextContent('true')
    expect(screen.getByTestId('updated-at')).toHaveTextContent('2026-07-18T10:30:00.000Z')
  })

  it('clears isOffline and the path timestamp on clearOfflineSnapshot', () => {
    render(
      <OfflineSnapshotProvider>
        <Probe path="/player/tournaments" />
      </OfflineSnapshotProvider>
    )

    act(() => notifyOfflineSnapshot('/player/tournaments', '2026-07-18T10:30:00.000Z'))
    act(() => clearOfflineSnapshot('/player/tournaments'))

    expect(screen.getByTestId('is-offline')).toHaveTextContent('false')
    expect(screen.getByTestId('updated-at')).toHaveTextContent('none')
  })

  it('clearOfflineSnapshot on a path that was never set is a safe no-op', () => {
    render(
      <OfflineSnapshotProvider>
        <Probe path="/player/tournaments" />
      </OfflineSnapshotProvider>
    )

    act(() => clearOfflineSnapshot('/player/tournaments'))

    expect(screen.getByTestId('is-offline')).toHaveTextContent('false')
    expect(screen.getByTestId('updated-at')).toHaveTextContent('none')
  })

  it('tracks timestamps independently per path', () => {
    function TwoProbes() {
      const { updatedAtFor } = useOfflineSnapshot()
      return (
        <div>
          <span data-testid="a">{updatedAtFor('/player/tournaments') ?? 'none'}</span>
          <span data-testid="b">{updatedAtFor('/tournaments/t1/bundle') ?? 'none'}</span>
        </div>
      )
    }

    render(
      <OfflineSnapshotProvider>
        <TwoProbes />
      </OfflineSnapshotProvider>
    )

    act(() => notifyOfflineSnapshot('/tournaments/t1/bundle', '2026-07-18T09:00:00.000Z'))

    expect(screen.getByTestId('a')).toHaveTextContent('none')
    expect(screen.getByTestId('b')).toHaveTextContent('2026-07-18T09:00:00.000Z')
  })

  it('sets isOffline on the browser offline event and clears it on online', () => {
    render(
      <OfflineSnapshotProvider>
        <Probe path="/player/tournaments" />
      </OfflineSnapshotProvider>
    )

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByTestId('is-offline')).toHaveTextContent('true')

    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.getByTestId('is-offline')).toHaveTextContent('false')
  })

  it('outside a provider, notify/clear calls are safe no-ops and defaults apply', () => {
    expect(() => notifyOfflineSnapshot('/x', '2026-01-01T00:00:00.000Z')).not.toThrow()

    function Bare() {
      const { isOffline, updatedAtFor } = useOfflineSnapshot()
      return <span data-testid="bare">{String(isOffline)}-{updatedAtFor('/x') ?? 'none'}</span>
    }
    render(<Bare />)
    expect(screen.getByTestId('bare')).toHaveTextContent('false-none')
  })
})
