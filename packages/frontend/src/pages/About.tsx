/**
 * About — /about (UAT ISSUE-36)
 *
 * Support is two-tier (owner decision, 2026-07-29): technical problems with
 * the webapp itself vs. everything else (fixtures, membership, "can I
 * join", scheduling), which goes to the player's group owners. Only the
 * second tier ships here — no technical-contact destination (email, form
 * backend, operator identity) exists in the app yet, and a placeholder
 * would promise help at the exact moment someone is already stuck. See the
 * "Not yet triaged" follow-up in UAT_ISSUES.md for the technical-contact gap.
 */
import React from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../constants/routes'

export const About: React.FC = () => {
  return (
    <div data-testid="about-page" style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 16 }}>
        About
      </h2>

      <section
        data-testid="support-section"
        style={{
          padding: 16,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--ink-50)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 8 }}>
          Support
        </h3>
        <p style={{ fontSize: 14, color: 'var(--ink-600)', marginBottom: 12 }}>
          For anything about games, fixtures or membership, message your group owners in the group.
        </p>
        <Link
          to={ROUTES.GROUPS}
          data-testid="support-groups-link"
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--court-600)' }}
        >
          Go to your groups
        </Link>
      </section>
    </div>
  )
}
