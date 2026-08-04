import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useGroupUnread } from '../../hooks/useGroupUnread'
import { useNotificationUnread } from '../../hooks/useNotificationUnread'
import { usePendingActions } from '../../hooks/usePendingActions'
import { useAppConfig } from '../../context/AppConfigContext'
import { MyGroupsUnreadBadge } from '../GroupChatPanel'
import { ROUTES } from '../../constants/routes'
import {
  TrophyIcon,
  TennisBallIcon,
  UsersIcon,
  BellIcon,
  KeyIcon,
  UserIcon,
  BuildingIcon,
  SettingsIcon,
  InfoIcon,
  LogOutIcon,
  StarIcon,
  type IconProps,
} from './icons'
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
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-(--rose-500) text-white rounded-full"
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

const MORE_ITEMS: Array<{
  label: string
  Icon: React.FC<IconProps>
  path: string
  organizerOnly?: boolean
  discoveryOnly?: boolean
}> = [
  // ISSUE-36: Account/Settings/About had no matching route at all. Account
  // repoints at the existing /profile rather than building a second page.
  { label: 'Account', Icon: UserIcon, path: ROUTES.PROFILE },
  { label: 'Organizer Dashboard', Icon: BuildingIcon, path: ROUTES.ORGANIZER, organizerOnly: true },
  { label: 'Settings', Icon: SettingsIcon, path: ROUTES.SETTINGS },
  { label: 'About', Icon: InfoIcon, path: ROUTES.ABOUT },
  // ISSUE-59: the bottom nav is fixed at 5 tabs — Browse moves in here
  // instead of claiming a 6th slot when discovery is enabled.
  { label: 'Browse', Icon: TrophyIcon, path: ROUTES.BROWSE, discoveryOnly: true },
]

const MoreSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { user } = useAuth()
  const { publicDiscoveryEnabled } = useAppConfig()
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
        {MORE_ITEMS.filter(item =>
          (!item.organizerOnly || user?.role === 'organizer') &&
          (!item.discoveryOnly || publicDiscoveryEnabled)
        ).map(item => (
          <button
            key={item.path}
            data-testid={`more-item-${item.path.replace(/^\//, '')}`}
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
            <span style={{ display: 'inline-flex', width: 28, justifyContent: 'center' }}>
              <item.Icon size={20} />
            </span>
            <span style={{ fontWeight: 500 }}>{item.label}</span>
          </button>
        ))}

        <hr style={{ margin: '4px 20px', border: 'none', borderTop: '1px solid var(--border)' }} />

        {/* Sign out */}
        <button
          data-testid="more-item-signout"
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
          <span style={{ display: 'inline-flex', width: 28, justifyContent: 'center' }}>
            <LogOutIcon size={20} />
          </span>
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
  const { publicDiscoveryEnabled } = useAppConfig()
  const groupsUnread = useGroupUnread()
  const notificationUnread = useNotificationUnread()
  const pendingActions = usePendingActions()
  const pendingGroupItems = pendingActions.openPolls.length + pendingActions.pendingCards.length
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const isActive = (path: string) => location.pathname.startsWith(path)

  // ISSUE-29: Browse is dropped entirely while discovery is blocked (default) —
  // testid kept as 'nav-browse' so it's ready to reappear unchanged if the
  // flag is ever flipped back on. Guest-only: an authenticated user's nav is
  // fixed at 5 tabs (ISSUE-59) and never shows Browse as a tab — it moves
  // into the More sheet (MORE_ITEMS) instead.
  const guestTabs = !isAuthenticated && publicDiscoveryEnabled
    ? [{ path: '/browse', label: 'Browse', Icon: TrophyIcon, testId: 'nav-browse' }]
    : []

  // ISSUE-59: bottom nav fixed at exactly 5 items for an authenticated user,
  // in this order. Each entry optionally carries a badge (two of the five
  // do) and/or a dynamic aria-label (Alerts does); the last entry is a
  // button (opens the More sheet) rather than a link.
  const authItems: Array<{
    testId: string
    label: string
    Icon?: React.FC<IconProps>
    path?: string
    onClick?: () => void
    ariaLabel?: string
    renderBadge?: () => React.ReactNode
  }> = [
    {
      testId: 'nav-groups', label: 'Groups', Icon: UsersIcon, path: '/groups',
      renderBadge: () => (
        <>
          {groupsUnread > 0 && (
            <span style={{ position: 'absolute', top: -6, right: -6 }}>
              <MyGroupsUnreadBadge count={groupsUnread} />
            </span>
          )}
          <NavCountBadge count={pendingGroupItems} testId="nav-badge-groups" corner="bottom" />
        </>
      ),
    },
    {
      testId: 'nav-play', label: 'Play', Icon: TennisBallIcon, path: '/play',
      renderBadge: () => <NavCountBadge count={pendingActions.unscoredMatches.length} testId="nav-badge-matches" />,
    },
    { testId: 'nav-ratings', label: 'Ratings', Icon: StarIcon, path: '/ratings' },
    {
      testId: 'nav-notifications', label: 'Alerts', Icon: BellIcon, path: '/notifications',
      ariaLabel: notificationUnread > 0 ? `Alerts, ${notificationUnread} unread` : 'Alerts',
      renderBadge: () => notificationUnread > 0 && (
        <span
          data-testid="notification-unread-badge"
          style={{ position: 'absolute', top: -6, right: -6 }}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold bg-(--gold-400) text-(--gold-900) rounded-full"
        >
          {notificationUnread > 99 ? '99+' : notificationUnread}
        </span>
      ),
    },
    { testId: 'nav-more', label: 'More', onClick: () => setIsMoreOpen(true) },
  ]

  return (
    <>
      <nav className="responsive-bottom-nav" aria-label="Mobile navigation">
        {guestTabs.map((tab) => (
          <a
            key={tab.path}
            href={tab.path}
            data-testid={tab.testId}
            className={`responsive-bottom-nav-item ${isActive(tab.path) ? 'active' : ''}`}
            aria-current={isActive(tab.path) ? 'page' : undefined}
          >
            <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
              <tab.Icon size={20} />
            </span>
            <span>{tab.label}</span>
          </a>
        ))}
        {!isAuthenticated && (
          <a
            href="/login"
            data-testid="nav-signin"
            className={`responsive-bottom-nav-item ${isActive('/login') ? 'active' : ''}`}
            aria-current={isActive('/login') ? 'page' : undefined}
          >
            <span aria-hidden="true"><KeyIcon size={20} /></span>
            <span>Sign in / Register</span>
          </a>
        )}
        {isAuthenticated && authItems.map((item) => (
          item.path ? (
            <a
              key={item.testId}
              href={item.path}
              data-testid={item.testId}
              className={`responsive-bottom-nav-item ${isActive(item.path) ? 'active' : ''}`}
              aria-current={isActive(item.path) ? 'page' : undefined}
              aria-label={item.ariaLabel}
            >
              <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
                {item.Icon && <item.Icon size={20} />}
                {item.renderBadge?.()}
              </span>
              <span>{item.label}</span>
            </a>
          ) : (
            <button
              key={item.testId}
              className="responsive-bottom-nav-item"
              data-testid={item.testId}
              onClick={item.onClick}
              aria-haspopup="dialog"
            >
              <span aria-hidden="true">⋯</span>
              <span>{item.label}</span>
            </button>
          )
        ))}
      </nav>
      <MoreSheet isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  )
}

const TopNav = () => {
  const location = useLocation()
  const { isAuthenticated } = useAuth()
  const isActive = (path: string) => location.pathname.startsWith(path)

  const authOnlyLinks = [
    { path: '/play', label: 'Play' },
    { path: '/groups', label: 'Groups' },
  ]
  const links = [
    ...(isAuthenticated ? authOnlyLinks : []),
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
        {!isAuthenticated && (
          <a
            href="/login"
            data-testid="nav-signin-desktop"
            className={`responsive-top-nav-link ${isActive('/login') ? 'active' : ''}`}
            aria-current={isActive('/login') ? 'page' : undefined}
          >
            Sign In
          </a>
        )}
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
