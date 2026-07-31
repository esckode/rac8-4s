/**
 * P13 Phase 13 — GET /player/partners (R28).
 *
 * Returns the caller's last 10 distinct doubles partners across all
 * groups/tournaments, most recent first, deduplicated by partner. Own
 * partners only — R1/R28 permit cross-group visibility solely because the
 * page is owner-private; there is no way to ask for another player's list.
 */
import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp } from '../helpers/app'
import { PlayerFactory, OrganizerFactory, TournamentFactory } from '../factories'
import { InMemoryTokenStore } from '../../auth/token-store'
import { generatePlayerSession } from '../../auth/magic-link'
import { TeamRepository } from '../../repositories/team-repository'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('GET /player/partners (P13 Phase 13)', () => {
  let pool: Pool
  let app: Express
  let tokenStore: InMemoryTokenStore
  let teamRepo: TeamRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    teamRepo = new TeamRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function playerToken() {
    const player = await PlayerFactory.create(pool)
    const session = await generatePlayerSession(
      { playerId: player.id, tournamentId: `tournament_${uid()}`, email: player.email, createdAt: Date.now() },
      3600,
      tokenStore
    )
    return { player, token: session.token }
  }

  async function openDoublesTournament() {
    const organizerId = OrganizerFactory.id()
    return TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
  }

  async function partnerWith(playerId: string, partnerId: string) {
    const tournament = await openDoublesTournament()
    await teamRepo.createTeam(tournament.id, playerId, partnerId)
  }

  function fetchPartners(token: string) {
    return request(app).get('/player/partners').set('Authorization', `Bearer ${token}`)
  }

  it('returns an empty list for a player who has never played doubles', async () => {
    const { token } = await playerToken()

    const res = await fetchPartners(token)

    expect(res.status).toBe(200)
    expect(res.body.partners).toEqual([])
  })

  it('returns partners most-recent-first, with name and last-partnered date', async () => {
    const { player, token } = await playerToken()
    const older = await PlayerFactory.create(pool)
    const newer = await PlayerFactory.create(pool)

    await partnerWith(player.id, older.id)
    await new Promise((r) => setTimeout(r, 10))
    await partnerWith(player.id, newer.id)

    const res = await fetchPartners(token)

    expect(res.status).toBe(200)
    expect(res.body.partners).toHaveLength(2)
    expect(res.body.partners[0].playerId).toBe(newer.id)
    expect(res.body.partners[0].name).toBe(newer.name)
    expect(res.body.partners[1].playerId).toBe(older.id)
    expect(new Date(res.body.partners[0].lastPartneredAt).getTime()).toBeGreaterThan(
      new Date(res.body.partners[1].lastPartneredAt).getTime()
    )
  })

  it('deduplicates a partner played with more than once, keeping the most recent date', async () => {
    const { player, token } = await playerToken()
    const partner = await PlayerFactory.create(pool)

    await partnerWith(player.id, partner.id)
    await new Promise((r) => setTimeout(r, 10))
    const secondTournament = await openDoublesTournament()
    await teamRepo.createTeam(secondTournament.id, partner.id, player.id) // reversed slot order, same pair

    const res = await fetchPartners(token)

    expect(res.body.partners).toHaveLength(1)
    expect(res.body.partners[0].playerId).toBe(partner.id)
  })

  it('returns at most 10, the most recent ones', async () => {
    const { player, token } = await playerToken()
    const partners: string[] = []
    for (let i = 0; i < 11; i++) {
      const p = await PlayerFactory.create(pool)
      partners.push(p.id)
      await partnerWith(player.id, p.id)
      await new Promise((r) => setTimeout(r, 5))
    }

    const res = await fetchPartners(token)

    expect(res.body.partners).toHaveLength(10)
    // The oldest (first created) partner must have been dropped.
    const returnedIds = res.body.partners.map((p: { playerId: string }) => p.playerId)
    expect(returnedIds).not.toContain(partners[0])
    expect(returnedIds).toContain(partners[10])
  })

  it("is unreachable for another player — only the caller's own partners come back", async () => {
    const { player: playerA, token: tokenA } = await playerToken()
    const { player: playerB, token: tokenB } = await playerToken()
    const partnerOfA = await PlayerFactory.create(pool)
    const partnerOfB = await PlayerFactory.create(pool)

    await partnerWith(playerA.id, partnerOfA.id)
    await partnerWith(playerB.id, partnerOfB.id)

    const resA = await fetchPartners(tokenA)
    const resB = await fetchPartners(tokenB)

    expect(resA.body.partners.map((p: { playerId: string }) => p.playerId)).toEqual([partnerOfA.id])
    expect(resB.body.partners.map((p: { playerId: string }) => p.playerId)).toEqual([partnerOfB.id])
  })
})
