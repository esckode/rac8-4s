/**
 * Settings — /settings (UAT ISSUE-36)
 *
 * App-level settings: PWA update/install state, offline cached-data
 * controls, a privacy link, and sign-out.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from '../Settings'

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

const mockGetUpdateAvailable = jest.fn()
const mockApplyUpdate = jest.fn()
const mockSubscribe = jest.fn()
jest.mock('../../pwa/register', () => ({
  getUpdateAvailable: () => mockGetUpdateAvailable(),
  applyUpdate: () => mockApplyUpdate(),
  subscribe: (listener: () => void) => mockSubscribe(listener),
}))

const mockWipePlayerData = jest.fn()
jest.mock('../../pwa/sw-bridge', () => ({
  wipePlayerData: () => mockWipePlayerData(),
}))

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>
  )
}

describe('Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUpdateAvailable.mockReturnValue(false)
    mockSubscribe.mockReturnValue(() => {})
    mockWipePlayerData.mockResolvedValue(undefined)
  })

  it('shows "latest version" when no update is available', () => {
    renderSettings()

    expect(screen.getByText(/latest version/i)).toBeInTheDocument()
    expect(screen.queryByTestId('settings-update-button')).not.toBeInTheDocument()
  })

  it('shows an update action when an update is available', () => {
    mockGetUpdateAvailable.mockReturnValue(true)
    renderSettings()

    const button = screen.getByTestId('settings-update-button')
    fireEvent.click(button)
    expect(mockApplyUpdate).toHaveBeenCalled()
  })

  it('shows an install action after the browser fires beforeinstallprompt', async () => {
    renderSettings()
    expect(screen.queryByTestId('settings-install-button')).not.toBeInTheDocument()

    const promptEvent = new Event('beforeinstallprompt', { cancelable: true }) as any
    promptEvent.prompt = jest.fn().mockResolvedValue(undefined)
    promptEvent.userChoice = Promise.resolve({ outcome: 'accepted' })

    act(() => {
      window.dispatchEvent(promptEvent)
    })

    const installButton = await screen.findByTestId('settings-install-button')
    fireEvent.click(installButton)

    await waitFor(() => expect(promptEvent.prompt).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('settings-install-button')).not.toBeInTheDocument())
  })

  it('clears cached offline data on request', async () => {
    renderSettings()

    fireEvent.click(screen.getByTestId('settings-clear-cache-button'))

    expect(mockWipePlayerData).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('settings-cache-cleared')).toBeInTheDocument())
  })

  it('links to the privacy policy', () => {
    renderSettings()

    expect(screen.getByTestId('settings-privacy-link')).toHaveAttribute('href', '/privacy')
  })

  it('navigates to /signout when sign out is clicked', () => {
    renderSettings()

    fireEvent.click(screen.getByTestId('settings-sign-out-button'))
    expect(mockNavigate).toHaveBeenCalledWith('/signout')
  })
})
