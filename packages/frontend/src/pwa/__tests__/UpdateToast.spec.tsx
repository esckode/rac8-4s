import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { UpdateToast } from '../UpdateToast'
import * as register from '../register'

jest.mock('../register')

const mockGetUpdateAvailable = register.getUpdateAvailable as jest.MockedFunction<typeof register.getUpdateAvailable>
const mockApplyUpdate = register.applyUpdate as jest.MockedFunction<typeof register.applyUpdate>
const mockSubscribe = register.subscribe as jest.MockedFunction<typeof register.subscribe>

describe('UpdateToast', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSubscribe.mockReturnValue(() => {})
  })

  it('renders nothing when no update is available', () => {
    mockGetUpdateAvailable.mockReturnValue(false)

    render(<UpdateToast />)

    expect(screen.queryByTestId('update-toast')).not.toBeInTheDocument()
  })

  it('renders the toast when an update is available on mount', () => {
    mockGetUpdateAvailable.mockReturnValue(true)

    render(<UpdateToast />)

    expect(screen.getByTestId('update-toast')).toBeInTheDocument()
  })

  it('renders the toast once subscribe notifies of a later update', () => {
    mockGetUpdateAvailable.mockReturnValueOnce(false)
    let notify: () => void = () => {}
    mockSubscribe.mockImplementation((listener) => {
      notify = listener
      return () => {}
    })

    render(<UpdateToast />)
    expect(screen.queryByTestId('update-toast')).not.toBeInTheDocument()

    mockGetUpdateAvailable.mockReturnValue(true)
    act(() => notify())

    expect(screen.getByTestId('update-toast')).toBeInTheDocument()
  })

  it('calls applyUpdate() when the refresh button is clicked', () => {
    mockGetUpdateAvailable.mockReturnValue(true)

    render(<UpdateToast />)
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    expect(mockApplyUpdate).toHaveBeenCalledTimes(1)
  })
})
