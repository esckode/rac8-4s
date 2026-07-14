import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useGroupUnread } from '../../hooks/useGroupUnread'
import { useNotificationUnread } from '../../hooks/useNotificationUnread'
import { usePendingActions } from '../../hooks/usePendingActions'
import { MyGroupsUnreadBadge } from '../GroupChatPanel'
import '../../styles/globals.css'

export interface ResponsiveLayoutProps {
  children: React.ReactNode
  showHeader?: boolean
  showNav?: boolean
}

/** Numeric nav-tab badge, capped at "9+" (P5 — counts communicate workload). */
const NavCountBadge: React.FC<{ count: number; testId: string; corner?: 'top' | 'bottom' }> = ({
  count, testId, corner = 'top',
}) => {
  if (count <= 0) return null
  return (
    <span
      data-testid={testId}
      style={{ position: 'absolute', [corner]: -6, right: -6 } as React.CSSProperties}
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-[--rose-500] text-white rounded-full"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

const MORE_ITEMS = [
  { label: 'Account', icon: '👤', path: '/account' },
  { label: 'Organizer Dashboard', icon: '🏟️', path: '/organizer', organizerOnly: true },
  { label: 'Settings', icon: '⚙️', path: '/settings' },
  { label: 'About', icon: 'ℹ️', path: '/about' },
]

const MoreSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { user } = useAuth()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const navigate = (path: string) => {
    onClose()
    window.location.href = path
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'var(--scrim)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="More options"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 51,
          background: 'var(--surface)',
          borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0',
          boxShadow: 'var(--shadow-xl)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 99, margin: '12px auto 4px' }} />

        {/* Title */}
        <div style={{ padding: '8px 20px 4px', fontSize: 13, fontWeight: 700, color: 'var(--ink-500)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Menu
        </div>

        {/* Items */}
        {MORE_ITEMS.filter(item => !item.organizerOnly || user?.role === 'organizer').map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              width: '100%', padding: '14px 20px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, color: 'var(--ink-900)', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--ink-50)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>{item.icon}</span>
            <span style={{ fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}

        <hr style={{ margin: '4px 20px', border: 'none', borderTop: '1px solid var(--border)' }} />

        {/* Sign out */}
        <button
          onClick={() => navigate('/signout')}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            width: '100%', padding: '14px 20px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 16, color: 'var(--rose-600)', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--ink-50)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ fontSize: 20, width: 28, textAlign: 'center' }}>🚪</span>
          <span style={{ fontWeight: 500 }}>Sign out</span>
        </button>

        <div style={{ height: 20 }} />
      </div>
    </>
  )
}

const BottomNav = () => {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const groupsUnread = useGroupUnread()
  const notificationUnread = useNotificationUnread()
  const pendingActions = usePendingActions()
  const pendingGroupItems = pendingActions.openPolls.length + pendingActions.pendingCards.length
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const isActive = (path: string) => location.pathname.startsWith(path)

  const tabs = [
    { path: '/browse', label: 'Tournaments', icon: '🏆', testId: 'nav-browse' },
    { path: '/standings', label: 'Standings', icon: '📊', testId: 'nav-standings' },
    { path: '/matches', label: 'Matches', icon: '🎾', testId: 'nav-matches' },
  ]

  return (
    <>
      <nav className="responsive-bottom-nav" aria-label="Mobile navigation">
        {tabs.map((tab) => (
          <a
            key={tab.path}
            href={tab.path}
            data-testid={tab.testId}
            className={`responsive-bottom-nav-item ${isActive(tab.path) ? 'active' : ''}`}
            aria-current={isActive(tab.path) ? 'page' : undefined}
          >
            <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
              {tab.icon}
              {tab.testId === 'nav-matches' && isAuthenticated && (
                <NavCountBadge count={pendingActions.unscoredMatches.length} testId="nav-badge-matches" />
              )}
            </span>
            <span>{tab.label}</span>
          </a>
        ))}
        {isAuthenticated && (
          <a
            href="/groups"
            data-testid="nav-groups"
            className={`responsive-bottom-nav-item ${isActive('/groups') ? 'active' : ''}`}
            aria-current={isActive('/groups') ? 'page' : undefined}
          >
            <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
              👥
              {groupsUnread > 0 && (
                <span style={{ position: 'absolute', top: -6, right: -6 }}>
                  <MyGroupsUnreadBadge count={groupsUnread} />
                </span>
              )}
              <NavCountBadge count={pendingGroupItems} testId="nav-badge-groups" corner="bottom" />
            </span>
            <span>Groups</span>
          </a>
        )}
        {isAuthenticated && (
          <a
            href="/notifications"
            data-testid="nav-notifications"
            className={`responsive-bottom-nav-item ${isActive('/notifications') ? 'active' : ''}`}
            aria-current={isActive('/notifications') ? 'page' : undefined}
            aria-label={notificationUnread > 0 ? `Notifications, ${notificationUnread} unread` : 'Notifications'}
          >
            <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
              🔔
              {notificationUnread > 0 && (
                <span
                  data-testid="notification-unread-badge"
                  style={{ position: 'absolute', top: -6, right: -6 }}
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-[--rose-500] text-white rounded-full"
                >
                  {notificationUnread > 99 ? '99+' : notificationUnread}
                </span>
              )}
            </span>
            <span>Notifications</span>
          </a>
        )}
        {isAuthenticated && (
          <button
            className="responsive-bottom-nav-item"
            onClick={() => setIsMoreOpen(true)}
            aria-haspopup="dialog"
          >
            <span aria-hidden="true">⋯</span>
            <span>More</span>
          </button>
        )}
      </nav>
      <MoreSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  )
}

const TopNav = () => {
  const location = useLocation()
  const isActive = (path: string) => location.pathname.startsWith(path)

  const links = [
    { path: '/groups', label: 'Groups' },
    { path: '/standings', label: 'Standings' },
    { path: '/matches', label: 'Matches' },
    { path: '/bracket', label: 'Bracket' },
    { path: '/more', label: 'More' },
  ]

  return (
    <nav className="responsive-top-nav" aria-label="Main navigation">
      <div className="responsive-top-nav-brand">Tournament</div>
      <div className="responsive-top-nav-links">
        {links.map((link) => (
          <a
            key={link.path}
            href={link.path}
            className={`responsive-top-nav-link ${isActive(link.path) ? 'active' : ''}`}
            aria-current={isActive(link.path) ? 'page' : undefined}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

const Header = () => {
  return (
    <header className="responsive-header">
      <h1>C.U.At.Court</h1>
      <div className="responsive-header-buttons">
        <a
          href="/profile"
          data-testid="nav-profile"
          className="responsive-header-button"
          aria-label="Open your profile"
        >
          Profile
        </a>
      </div>
    </header>
  )
}

export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({
  children,
  showHeader = true,
  showNav = true,
}) => {
  return (
    <div className="responsive-container">
      {showHeader && <Header />}

      {showNav && <TopNav />}

      <main className="responsive-main">
        {children}
      </main>

      {showNav && <BottomNav />}
    </div>
  )
}
