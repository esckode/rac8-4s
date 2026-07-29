import React from 'react'
import { Link } from 'react-router-dom'

/**
 * Catch-all 404 (UAT ISSUE-29). Previously no path="*" route existed at all —
 * any typo'd or blocked URL rendered a blank router outlet. Also what
 * /browse and /tournament/:id/browse render when publicDiscoveryEnabled is
 * off (AppConfigContext / DiscoveryGate in App.tsx).
 */
export const NotFound: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', fontFamily: 'sans-serif' }}>
      <h1>Page not found</h1>
      <p>That page doesn&apos;t exist, or isn&apos;t available right now.</p>
      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/" style={{ color: 'var(--court-600)', fontWeight: 600 }}>
          Go home
        </Link>
      </p>
    </div>
  )
}

export default NotFound
