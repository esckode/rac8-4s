import { readFileSync } from 'fs'
import { join } from 'path'

const TOKENS_CSS_PATH = join(__dirname, '../../styles/tokens.css')

/**
 * E5.0 — new semantic tokens required to retrofit the 10 legacy files
 * (auth dark-theme gradient/glass, onboarding form, tournament cover chips,
 * the ResponsiveLayout scrim, and two ad-hoc CSS-var fallback colors).
 * See assets/planning/DESIGN_SYSTEM_ENFORCEMENT.md E5.0 for the full mapping.
 */
const NEW_TOKENS = [
  // Scrim (ResponsiveLayout modal overlay)
  '--scrim',

  // Auth dark gradient panel (Login/ResetPassword/ForgotPassword/Landing)
  '--auth-bg-top',
  '--auth-bg-bottom',
  '--auth-danger',
  '--auth-danger-soft',
  '--auth-danger-text',
  '--auth-warning',
  '--auth-warning-text',
  '--auth-info-glow',

  // Auth glass surfaces (white-on-dark alpha steps)
  '--auth-glass-bg',
  '--auth-glass-bg-hover',
  '--auth-glass-border',
  '--auth-glass-border-strong',
  '--auth-glass-text',
  '--auth-glass-text-strong',
  '--auth-glass-text-muted',
  '--auth-glass-text-faint',
  '--auth-glass-placeholder',
  '--auth-glass-icon-muted',
  '--auth-glass-divider',

  // Auth info/danger/warning glass washes
  '--auth-info-wash',
  '--auth-info-border',
  '--auth-info-underline',
  '--auth-danger-wash',
  '--auth-danger-wash-strong',
  '--auth-danger-ring',
  '--auth-danger-border',
  '--auth-warning-wash',
  '--auth-warning-border',

  // Onboarding form (Signup/DobScreen)
  '--onboard-field-bg',
  '--onboard-field-border',
  '--onboard-disabled',
  '--onboard-accent',
  '--onboard-danger',
  '--onboard-muted-text',

  // Tournament cover chips (BrowseTournaments)
  '--cover-court',
  '--cover-lavender',
  '--cover-mint',
  '--cover-peach',
  '--cover-gold',

  // Ad-hoc CSS-var fallback colors (TournamentBrowse var(--danger, #b00) / var(--success, #0a7))
  '--danger',
  '--success',
]

describe('tokens.css — E5.0 new semantic tokens', () => {
  const css = readFileSync(TOKENS_CSS_PATH, 'utf-8')

  it.each(NEW_TOKENS)('defines %s', (tokenName) => {
    expect(css).toContain(`${tokenName}:`)
  })
})
