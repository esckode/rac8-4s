import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { issueOrganizerToken } from '../../auth/tokens'
import { JwtConfig } from '../helpers/app'

export const OrganizerFactory = {
  /**
   * Generate a unique organizer ID using UUID.
   * No collisions possible across parallel test runs.
   */
  id(): string {
    return `org_${crypto.randomUUID().slice(0, 8)}`
  },

  /**
   * Issue an organizer JWT token for testing.
   */
  token(jwtConfig: JwtConfig, sub?: string) {
    const organizerId = sub || this.id()
    const { accessToken } = issueOrganizerToken(
      {
        sub: organizerId,
        email: `${organizerId}@test.local`,
      },
      jwtConfig
    )

    return {
      sub: organizerId,
      accessToken,
    }
  },

  /**
   * Issue an account JWT with role 'player' — the shape a real registered
   * player's login produces (auth.ts's local issueSessionToken). Distinct
   * from token() above, which hardcodes role 'organizer' and so cannot
   * represent "a registered player account", the case ISSUE-32/24 are about.
   */
  playerRoleToken(
    jwtConfig: JwtConfig,
    payload: { sub?: string; email?: string; playerId?: string } = {}
  ) {
    const sub = payload.sub || `account_${crypto.randomUUID().slice(0, 8)}`
    const email = payload.email || `${sub}@test.local`
    const accessToken = jwt.sign(
      {
        sub,
        email,
        role: 'player',
        ...(payload.playerId ? { playerId: payload.playerId } : {}),
        jti: crypto.randomUUID(),
      },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expiresInSeconds }
    )

    return { sub, accessToken }
  },
}
