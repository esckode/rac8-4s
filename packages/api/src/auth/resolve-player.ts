import { JwtConfig } from './tokens'
import { TokenStore } from './token-store'
import { requirePlayerSessionAuth, requireOrganizerAuth } from './middleware'
import { PlayerNotLinkedError } from './errors'
import type { MagicLinkPayload } from './magic-link'

/**
 * Shared identity-only half of the dual-auth resolvers duplicated across
 * player.ts, tournaments.ts and (until ISSUE-35) analytics.ts — resolve the
 * acting player from either a magic-link player session or a registered
 * account JWT with a linked playerId. No tournament-membership or
 * registration check; callers that need that layer it on top using the
 * `via` discriminator (see routes/tournaments.ts's resolveTournamentPlayer).
 *
 * Throws PlayerNotLinkedError (ISSUE-24) if the account JWT is valid but has
 * no linked player, or rethrows the session-auth error (→ 401) if neither
 * path authenticates.
 */
export type ResolvedPlayer =
  | { playerId: string; via: 'session'; session: MagicLinkPayload }
  | { playerId: string; via: 'account' }

export async function resolvePlayerIdentity(
  deps: { jwtConfig: JwtConfig; tokenStore: TokenStore },
  authHeader: string | undefined
): Promise<ResolvedPlayer> {
  try {
    const session = await requirePlayerSessionAuth(authHeader, deps.tokenStore)
    return { playerId: session.playerId, via: 'session', session }
  } catch (sessionErr) {
    let account
    try {
      account = await requireOrganizerAuth(authHeader, deps.jwtConfig, deps.tokenStore)
    } catch {
      throw sessionErr
    }
    // Participation depends on a linked playerId, not the authority role —
    // an organizer who also plays qualifies (dual-role).
    if (!account.playerId) {
      throw new PlayerNotLinkedError()
    }
    return { playerId: account.playerId, via: 'account' }
  }
}
