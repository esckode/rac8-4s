import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { TournamentRepository, GroupRepository, KnockoutRepository, PlayerRepository } from '../../db'
import { generatePlayerSession } from '../../auth/magic-link'

/**
 * Real-Time (SSE): submitting a knockout score must broadcast a `bracket.updated`
 * event on the BroadcastBus so connected clients can refresh the bracket live
 * (e2e-scenarios.md → "User receives live bracket update"). Mirrors the existing
 * `bracket.published` broadcast emitted by the bracket-generation job.
 */
describe('Bracket API - SSE bracket.updated on knockout score', () => {
  let pool: Pool
  let app: Express
  let tokenStore: any
  let jwtConfig: JwtConfig
  const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool, { broadcastBus: broadcastBus as any })
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // 4 advancing players → 4-participant singles bracket (two semifinals, both with
  // real player ids), published into knockout_active.
  async function setupPublishedSinglesBracket(organizerId: string, orgToken: string) {
    const tournament = await TournamentFactory.create(pool, organizerId)
    const repo = new TournamentRepository(pool)
    await repo.updateStatus(tournament.id, 'registration_closed')

    const playerIds: string[] = []
    for (let i = 0; i < 6; i++) {
      const player = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, { email: player.email, name: player.name })
      playerIds.push(player.id)
    }

    const groupRepo = new GroupRepository(pool)
    await groupRepo.createGroups(tournament.id, 2, 2, playerIds)
    await repo.updateStatus(tournament.id, 'group_stage_complete')

    await request(app)
      .post(`/tournaments/${tournament.id}/bracket/generate`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200)
    await request(app)
      .post(`/tournaments/${tournament.id}/bracket/publish`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200)

    return { tournament }
  }

  it('emits bracket.updated when a participant submits a knockout score', async () => {
    const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const { tournament } = await setupPublishedSinglesBracket(organizerId, orgToken)

    const knockoutRepo = new KnockoutRepository(pool)
    const match: any = (await knockoutRepo.findKnockoutMatchesByTournament(tournament.id)).find(
      (m: any) => m.player1_id && m.player2_id && m.status === 'pending'
    )
    expect(match).toBeTruthy()

    const player = await new PlayerRepository(pool).findById(match.player1_id)
    const session = await generatePlayerSession(
      { playerId: player!.id, tournamentId: tournament.id, email: player!.email, createdAt: Date.now() },
      3600,
      tokenStore
    )

    broadcastBus.emit.mockClear()

    const res = await request(app)
      .post(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ score: '6-4, 6-3' }) // factory tournaments are tennis

    if (res.status !== 200) throw new Error(`score ${res.status}: ${JSON.stringify(res.body)}`)

    expect(broadcastBus.emit).toHaveBeenCalledWith(
      tournament.id,
      'bracket.updated',
      expect.objectContaining({ matchId: match.id })
    )
  })
})
