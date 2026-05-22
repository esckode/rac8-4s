import crypto from 'crypto'
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
}
