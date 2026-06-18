import request from 'supertest'
import { Express } from 'express'
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { createTestApp, JwtConfig } from '../helpers/app'
import { PlayerFactory, TournamentFactory, OrganizerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, KnockoutRepository } from '../../db'
import { TeamRepository } from '../../repositories/team-repository'
import { generatePlayerSession } from '../../auth/magic-link'

/**
 * Doubles knockout: the bracket must be team-based end-to-end — generation seeds
 * advancing TEAMS, published knockout matches carry team ids (format='doubles'),
 * a team member can submit the score, and the bundle surfaces team ids + names.
 */
describe('Bracket API - Doubles knockout', () => {
  let pool: Pool
  let app: Express
  let tokenStore: any
  let jwtConfig: JwtConfig

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    const deps = createTestApp(pool)
    app = deps.app
    tokenStore = deps.tokenStore
    jwtConfig = deps.jwtConfig
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  // 8 players → 4 auto-formed teams → 2 groups (advancing 1) → 2-team knockout.
  async function setupDoublesBracket(organizerId: string, orgToken: string) {
    const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
    const repo = new TournamentRepository(pool)
    const playerRepo = new PlayerRepository(pool)
    await repo.updateStatus(tournament.id, 'registration_closed')

    const players = []
    for (let i = 0; i < 8; i++) {
      const p = await PlayerFactory.create(pool)
      await playerRepo.createRegistration(p.id, tournament.id)
      players.push(p)
    }

    const groupRes = await request(app)
      .post(`/tournaments/${tournament.id}/groups`)
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ numGroups: 2, advancingPerGroup: 1 })
    expect(groupRes.status).toBe(201)

    await repo.updateStatus(tournament.id, 'group_stage_complete')
    return { tournament, players }
  }

  async function generateAndPublish(tournamentId: string, orgToken: string) {
    const gen = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/generate`)
      .set('Authorization', `Bearer ${orgToken}`)
    expect(gen.status).toBe(200)
    const pub = await request(app)
      .post(`/tournaments/${tournamentId}/bracket/publish`)
      .set('Authorization', `Bearer ${orgToken}`)
    expect(pub.status).toBe(200)
  }

  it('publishes team-based knockout matches (format=doubles, team ids, no player ids)', async () => {
    const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const { tournament } = await setupDoublesBracket(organizerId, orgToken)
    await generateAndPublish(tournament.id, orgToken)

    const knockoutRepo = new KnockoutRepository(pool)
    const matches = await knockoutRepo.findKnockoutMatchesByTournament(tournament.id)
    expect(matches.length).toBeGreaterThan(0)

    const playable = matches.find((m: any) => m.team1_id && m.team2_id)
    expect(playable).toBeTruthy()
    expect(playable!.format).toBe('doubles')
    expect((playable as any).player1_id).toBeNull()
    expect((playable as any).player2_id).toBeNull()
  })

  it('lets a team member submit a knockout score; the winning team is recorded', async () => {
    const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const { tournament } = await setupDoublesBracket(organizerId, orgToken)
    await generateAndPublish(tournament.id, orgToken)

    const knockoutRepo = new KnockoutRepository(pool)
    const teamRepo = new TeamRepository(pool)
    const match: any = (await knockoutRepo.findKnockoutMatchesByTournament(tournament.id)).find(
      (m: any) => m.team1_id && m.team2_id && m.status === 'pending'
    )
    expect(match).toBeTruthy()

    const team1 = await teamRepo.findTeamById(match.team1_id)
    const member = await new PlayerRepository(pool).findById(team1!.player1Id)
    const session = await generatePlayerSession(
      { playerId: member!.id, tournamentId: tournament.id, email: member!.email, createdAt: Date.now() },
      3600,
      tokenStore
    )

    const res = await request(app)
      .post(`/tournaments/${tournament.id}/knockout/${match.id}/score`)
      .set('Authorization', `Bearer ${session.token}`)
      .send({ score: '11-9, 11-7' })

    expect(res.status).toBe(200)
    expect(res.body.match.winnerId).toBe(match.team1_id)
  })

  it('bundle exposes doubles bracket with team ids and team names', async () => {
    const { sub: organizerId, accessToken: orgToken } = OrganizerFactory.token(jwtConfig)
    const { tournament } = await setupDoublesBracket(organizerId, orgToken)
    await generateAndPublish(tournament.id, orgToken)

    const res = await request(app)
      .get(`/tournaments/${tournament.id}/bundle`)
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)

    const firstRound = res.body.bracket.rounds[0]
    const m = firstRound.matches[0]
    // Participant ids are team ids that appear in the teams name-map.
    expect(Array.isArray(res.body.teams)).toBe(true)
    const teamIds = res.body.teams.map((t: any) => t.id)
    expect(teamIds).toContain(m.player1Id)
    const named = res.body.teams.find((t: any) => t.id === m.player1Id)
    expect(typeof named.name).toBe('string')
    expect(named.name).toMatch(/&/) // "P1 & P2"
  })
})
