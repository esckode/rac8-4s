import React from 'react'
import { render, screen } from '@testing-library/react'
import { OfflineBanner } from '../OfflineBanner'
import * as OfflineSnapshotContext from '../OfflineSnapshotContext'

jest.mock('../OfflineSnapshotContext', () => ({
  useOfflineSnapshot: jest.fn(),
}))

const mockUseOfflineSnapshot = OfflineSnapshotContext.useOfflineSnapshot as jest.MockedFunction<
  typeof OfflineSnapshotContext.useOfflineSnapshot
>

describe('OfflineBanner', () => {
  it('renders nothing when online', () => {
    mockUseOfflineSnapshot.mockReturnValue({ isOffline: false, updatedAtFor: () => undefined })

    render(<OfflineBanner />)

    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument()
  })

  it('renders the banner when offline', () => {
    mockUseOfflineSnapshot.mockReturnValue({ isOffline: true, updatedAtFor: () => undefined })

    render(<OfflineBanner />)

    expect(screen.getByTestId('offline-banner')).toBeInTheDocument()
    expect(screen.getByTestId('offline-banner')).toHaveTextContent(/offline/i)
  })
})
