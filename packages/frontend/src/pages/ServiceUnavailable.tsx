import React from 'react'

/**
 * Maintenance page shown when the API returns 503 (Redis outage).
 * Stands alone — no nav links, no API calls.
 * V1.5 — whole-site-down model per §0 Failure model.
 */
export const ServiceUnavailable: React.FC = () => {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', fontFamily: 'sans-serif' }}>
      <h1>Service Temporarily Unavailable</h1>
      <p>We&apos;re experiencing a temporary issue. Please try again in a few moments.</p>
      <p style={{ color: '#888', fontSize: '0.9rem' }}>
        If the problem persists, please contact support.
      </p>
    </div>
  )
}

export default ServiceUnavailable
