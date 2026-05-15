import React from 'react'
import { useLocation } from 'react-router-dom'
import '../../../styles/tokens.css'

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
    <nav
      className={`
        fixed
        bottom-0
        left-0
        right-0
        sm:hidden
        bg-white
        border-t
        border-[--border]
        z-40
        flex
        items-center
        justify-around
        h-[72px]
      `}
    >
      {tabs.map((tab) => (
        <a
          key={tab.path}
          href={tab.path}
          className={`
            flex
            flex-col
            items-center
            justify-center
            flex-1
            py-[--s-2]
            px-[--s-2]
            text-xs
            transition-colors
            duration-[--duration-normal]
            ${
              isActive(tab.path)
                ? 'text-[--court-500] border-t-2 border-[--court-500]'
                : 'text-[--ink-600] hover:text-[--ink-900]'
            }
          `}
        >
          <span className="text-lg mb-[--s-1]">{tab.icon}</span>
          <span className="font-medium">{tab.label}</span>
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
    <nav
      className={`
        hidden
        sm:flex
        bg-white
        border-b
        border-[--border]
        items-center
        gap-[--s-6]
        px-[--s-6]
        h-16
        sticky
        top-0
        z-40
      `}
    >
      <div className="text-lg font-bold text-[--court-600]">Tournament</div>
      <div className="flex gap-[--s-6] ml-auto">
        {links.map((link) => (
          <a
            key={link.path}
            href={link.path}
            className={`
              pb-4
              text-sm
              font-medium
              border-b-2
              transition-colors
              duration-[--duration-normal]
              ${
                isActive(link.path)
                  ? 'text-[--court-600] border-[--court-500]'
                  : 'text-[--ink-600] border-transparent hover:text-[--ink-900]'
              }
            `}
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
    <header
      className={`
        hidden
        sm:flex
        bg-white
        border-b
        border-[--border]
        px-[--s-6]
        py-[--s-4]
        items-center
        justify-between
        sticky
        top-0
        z-30
      `}
    >
      <h1 className="text-2xl font-bold text-[--ink-900]">Doubles Pickleball</h1>
      <div className="flex items-center gap-[--s-4]">
        <button
          className={`
            px-[--s-4]
            py-[--s-2]
            text-sm
            font-medium
            text-[--court-600]
            hover:text-[--court-700]
            transition-colors
            duration-[--duration-normal]
            focus:outline-none
            focus:ring-2
            focus:ring-[--court-400]
            focus:ring-offset-2
          `}
        >
          Account
        </button>
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
    <div className="flex flex-col min-h-screen bg-[--ink-50]">
      {showHeader && <Header />}

      {showNav && <TopNav />}

      <main
        className={`
          flex-1
          w-full
          overflow-y-auto
          px-[--s-4]
          sm:px-[--s-6]
          py-[--s-4]
          sm:py-[--s-6]
          pb-[88px]
          sm:pb-[--s-6]
        `}
      >
        {children}
      </main>

      {showNav && <BottomNav />}
    </div>
  )
}
