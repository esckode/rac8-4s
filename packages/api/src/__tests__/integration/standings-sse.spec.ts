import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { TournamentRepository, GroupRepository, PlayerRepository } from '../../db'
import { generatePlayerSession } from '../../auth/magic-link'
import { ConversationRepository } from '../../repositories/conversation-repository'

/**
 * Real-Time (SSE): submitting a group-stage score must broadcast a
 * `standings.updated` event so connected clients refresh standings live
 * (e2e-scenarios.md → "User receives live standings update"). The InMemoryJobQueue
 * has no consumer, so the route emits the recalculated standings synchronously.
 */
describe('Group score API - SSE standings.updated', () => {
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

  async function setupGroupStage(organizerId: string) {
    const tournament = await TournamentFactory.create(pool, organizerId)
    const repo = new TournamentRepository(pool)
    await repo.updateStatus(tournament.id, 'registration_closed')

    const playerIds: string[] = []
    for (let i = 0; i < 2; i++) {
      const player = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, { email: player.email, name: player.name })
      playerIds.push(player.id)
    }

    const groupRepo = new GroupRepository(pool)
    const groups = await groupRepo.createGroups(tournament.id, 1, 1, playerIds)
    await repo.updateStatus(tournament.id, 'group_stage_active')

    const matches = await groupRepo.findMatchesByGroup(groups[0].id)
    return { tournament, match: matches[0], groupId: groups[0].id }
  }

  it('emits standings.updated when a participant submits a group score', async () => {
    const { sub: organizerId } = OrganizerFactory.token(jwtConfig)
    const { tournament, match, groupId } = await setupGroupStage(organizerId)

    const player = await new PlayerRepository(pool).findById(match.player1_id!)
    const session = await generatePlayerSession(
      { playerId: player!.id, tournamentId: tournament.id, email: player!.email, createdAt: Date.now() },
      3600,
      tokenStore
    )

    broadcastBus.emit.mockClear()

    const res = await request(app)
      .post(`/tournaments/${tournament.id}/matches/${match.id}/score`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ score: '6-4, 6-3' }) // factory tournaments are tennis

    if (res.status !== 200) throw new Error(`score ${res.status}: ${JSON.stringify(res.body)}`)

    // The bus is now keyed on conversation_id (not tournamentId) — resolve it to verify
    const convRepo = new ConversationRepository(pool)
    const conversationId = await convRepo.resolveConversation(tournament.id)

    expect(broadcastBus.emit).toHaveBeenCalledWith(
      conversationId,
      'standings.updated',
      expect.objectContaining({ groupId })
    )
  })
})
