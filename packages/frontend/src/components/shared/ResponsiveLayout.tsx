import React from 'react'
import { useLocation } from 'react-router-dom'
import '../../styles/globals.css'

export interface ResponsiveLayoutProps {
  children: React.ReactNode
  showHeader?: boolean
  showNav?: boolean
}

const BottomNav = () => {
  const location = useLocation()
  const isActive = (path: string) => location.pathname.startsWith(path)

  const tabs = [
    { path: '/standings', label: 'Standings', icon: '📊' },
    { path: '/matches', label: 'Matches', icon: '🎾' },
    { path: '/bracket', label: 'Bracket', icon: '🏆' },
    { path: '/more', label: 'More', icon: '⋯' },
  ]

  return (
    <nav className="responsive-bottom-nav" aria-label="Mobile navigation">
      {tabs.map((tab) => (
        <a
          key={tab.path}
          href={tab.path}
          className={`responsive-bottom-nav-item ${isActive(tab.path) ? 'active' : ''}`}
          aria-current={isActive(tab.path) ? 'page' : undefined}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  )
}

const TopNav = () => {
  const location = useLocation()
  const isActive = (path: string) => location.pathname.startsWith(path)

  const links = [
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
        <button className="responsive-header-button" aria-label="Open account menu">Account</button>
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
