/// <reference types="@testing-library/jest-dom" />
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { AppConfigProvider, useAppConfig } from '../AppConfigContext'

const Probe: React.FC = () => {
  const { publicDiscoveryEnabled, loading } = useAppConfig()
  return <div data-testid="probe">{loading ? 'loading' : String(publicDiscoveryEnabled)}</div>
}

describe('AppConfigContext (ISSUE-29)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('starts in a loading state before the fetch resolves', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as any
    render(<AppConfigProvider><Probe /></AppConfigProvider>)
    expect(screen.getByTestId('probe')).toHaveTextContent('loading')
  })

  it('exposes publicDiscoveryEnabled=true once GET /api/config resolves true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ publicDiscoveryEnabled: true }),
    }) as any
    render(<AppConfigProvider><Probe /></AppConfigProvider>)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('true'))
    expect(global.fetch).toHaveBeenCalledWith('/api/config')
  })

  it('exposes publicDiscoveryEnabled=false when the API says so', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ publicDiscoveryEnabled: false }),
    }) as any
    render(<AppConfigProvider><Probe /></AppConfigProvider>)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('false'))
  })

  it('fails closed (false) when the config fetch errors — never accidentally exposes discovery', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any
    render(<AppConfigProvider><Probe /></AppConfigProvider>)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('false'))
  })

  it('fails closed (false) when the API responds non-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as any
    render(<AppConfigProvider><Probe /></AppConfigProvider>)
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('false'))
  })
})
