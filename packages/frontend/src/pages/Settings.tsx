/**
 * Settings — /settings (UAT ISSUE-36)
 *
 * App-level settings, distinct from /profile (player-scoped: display density,
 * notifications, availability). Scope agreed with the user 2026-07-29: PWA
 * install/update state, offline cached-data controls, sign-out, and a link
 * to the already-built /privacy page.
 */
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../constants/routes'
import { getUpdateAvailable, applyUpdate, subscribe as subscribeToUpdates } from '../pwa/register'
import { wipePlayerData } from '../pwa/sw-bridge'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const sectionStyle: React.CSSProperties = { marginBottom: 24 }
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 8,
}
const mutedTextStyle: React.CSSProperties = { fontSize: 14, color: 'var(--ink-600)', marginBottom: 8 }
const actionButtonStyle: React.CSSProperties = {
  display: 'inline-block', fontSize: 14, fontWeight: 500, color: 'var(--court-600)',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
}

export const Settings: React.FC = () => {
  const navigate = useNavigate()
  const [updateAvailable, setUpdateAvailable] = useState(getUpdateAvailable())
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  useEffect(() => subscribeToUpdates(() => setUpdateAvailable(getUpdateAvailable())), [])

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setInstallEvent(null)
  }

  const handleClearData = async () => {
    setClearing(true)
    setCleared(false)
    await wipePlayerData()
    setClearing(false)
    setCleared(true)
  }

  return (
    <div data-testid="settings-page" style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 16 }}>
        Settings
      </h2>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>App</h3>
        {updateAvailable ? (
          <button type="button" data-testid="settings-update-button" onClick={() => applyUpdate()} style={actionButtonStyle}>
            Update available — Refresh now
          </button>
        ) : (
          <p style={mutedTextStyle}>You're on the latest version.</p>
        )}
        {installEvent && !installed && (
          <button type="button" data-testid="settings-install-button" onClick={handleInstall} style={{ ...actionButtonStyle, marginTop: 8 }}>
            Install app
          </button>
        )}
        {installed && <p style={mutedTextStyle}>App installed.</p>}
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Offline data</h3>
        <p style={mutedTextStyle}>
          Clears cached venue data and any offline scores waiting to sync.
        </p>
        <button type="button" data-testid="settings-clear-cache-button" onClick={handleClearData} disabled={clearing} style={actionButtonStyle}>
          {clearing ? 'Clearing…' : 'Clear cached data'}
        </button>
        {cleared && <p data-testid="settings-cache-cleared" style={mutedTextStyle}>Cleared.</p>}
      </section>

      <section style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Privacy</h3>
        <Link to={ROUTES.PRIVACY} data-testid="settings-privacy-link" style={actionButtonStyle}>
          Privacy policy
        </Link>
      </section>

      <section>
        <button
          type="button"
          data-testid="settings-sign-out-button"
          onClick={() => navigate('/signout')}
          style={{ ...actionButtonStyle, color: 'var(--rose-600)' }}
        >
          Sign out
        </button>
      </section>
    </div>
  )
}
