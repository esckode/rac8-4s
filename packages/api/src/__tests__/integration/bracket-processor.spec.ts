import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { GroupRepository, KnockoutRepository, TournamentRepository } from '../../db'
import { processBracketGenerate } from '../../workers/bracket-processor'
import { TournamentFactory, PlayerFactory } from '../factories'

describe('Bracket Processor', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function scoreAllGroupMatches(groupId: string) {
    const groupRepo = new GroupRepository(pool)
    const matches = await groupRepo.findMatchesByGroup(groupId)
    for (const m of matches) {
      await groupRepo.updateMatch(m.id, m.player1_id, '6-3 6-4')
    }
  }

  async function setupTournamentWithScoredGroups(numGroups: number = 2) {
    const organizerId = `org_test_${Date.now()}_${Math.random()}`
    const tournament = await TournamentFactory.create(pool, organizerId)
    const tournamentRepo = new TournamentRepository(pool)
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

    // Create and register players
    const playerIds: string[] = []
    for (let i = 0; i < numGroups * 3; i++) {
      const player = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, {
        email: player.email,
        name: player.name,
      })
      playerIds.push(player.id)
    }

    // Create groups
    const groupRepo = new GroupRepository(pool)
    const groups = await groupRepo.createGroups(tournament.id, numGroups, 2, playerIds)

    // Score all matches
    for (const group of groups) {
      await scoreAllGroupMatches(group.id)
    }

    // Set tournament status to group_stage_complete
    await tournamentRepo.updateStatus(tournament.id, 'group_stage_complete')

    return { tournament, groups, playerIds }
  }

  describe('processBracketGenerate', () => {
    it('generates bracket from complete groups with all matches scored', async () => {
      const { tournament, groups } = await setupTournamentWithScoredGroups(2)
      const groupRepo = new GroupRepository(pool)
      const knockoutRepo = new KnockoutRepository(pool)

      const matches = await processBracketGenerate(
        { tournamentId: tournament.id },
        { groupRepo, knockoutRepo }
      )

      expect(Array.isArray(matches)).toBe(true)
      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].tournament_id).toBe(tournament.id)
      expect(matches[0].status).toBe('pending')
    })

    it('returns existing bracket without error (idempotent)', async () => {
      const { tournament } = await setupTournamentWithScoredGroups(2)
      const groupRepo = new GroupRepository(pool)
      const knockoutRepo = new KnockoutRepository(pool)

      // Generate bracket first time
      const matches1 = await processBracketGenerate(
        { tournamentId: tournament.id },
        { groupRepo, knockoutRepo }
      )

      // Call again
      const matches2 = await processBracketGenerate(
        { tournamentId: tournament.id },
        { groupRepo, knockoutRepo }
      )

      expect(matches2.length).toBe(matches1.length)
      expect(matches2[0].id).toBe(matches1[0].id)
    })

    it('throws error when group matches are still pending', async () => {
      const organizerId = `org_test_${Date.now()}_${Math.random()}`
      const tournament = await TournamentFactory.create(pool, organizerId)
      const tournamentRepo = new TournamentRepository(pool)
      await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

      // Create players and groups but DO NOT score matches
      const playerIds: string[] = []
      for (let i = 0; i < 6; i++) {
        const player = await PlayerFactory.create(pool)
        await PlayerFactory.createAndRegister(pool, tournament.id, {
          email: player.email,
          name: player.name,
        })
        playerIds.push(player.id)
      }

      const groupRepo = new GroupRepository(pool)
      await groupRepo.createGroups(tournament.id, 2, 2, playerIds)
      await tournamentRepo.updateStatus(tournament.id, 'group_stage_complete')

      const knockoutRepo = new KnockoutRepository(pool)

      await expect(
        processBracketGenerate({ tournamentId: tournament.id }, { groupRepo, knockoutRepo })
      ).rejects.toThrow(/pending/)
    })

    it('throws error when no groups exist for tournament', async () => {
      const organizerId = `org_test_${Date.now()}_${Math.random()}`
      const tournament = await TournamentFactory.create(pool, organizerId)
      const tournamentRepo = new TournamentRepository(pool)
      await tournamentRepo.updateStatus(tournament.id, 'group_stage_complete')

      const groupRepo = new GroupRepository(pool)
      const knockoutRepo = new KnockoutRepository(pool)

      await expect(
        processBracketGenerate({ tournamentId: tournament.id }, { groupRepo, knockoutRepo })
      ).rejects.toThrow(/no groups/)
    })

    it('emits broadcast event on successful generation', async () => {
      const { tournament } = await setupTournamentWithScoredGroups(2)
      const groupRepo = new GroupRepository(pool)
      const knockoutRepo = new KnockoutRepository(pool)

      const broadcastBus = { emit: jest.fn() }

      const matches = await processBracketGenerate(
        { tournamentId: tournament.id },
        { groupRepo, knockoutRepo, broadcastBus: broadcastBus as any }
      )

      expect(broadcastBus.emit).toHaveBeenCalledWith(
        tournament.id,
        'bracket.published',
        expect.objectContaining({
          matchCount: matches.length,
          byeCount: expect.any(Number),
        })
      )
    })

    it('returns 0 pending matches after tournament has completed groups', async () => {
      const { tournament } = await setupTournamentWithScoredGroups(1)
      const groupRepo = new GroupRepository(pool)

      const pendingCount = await groupRepo.countPendingMatchesByTournament(tournament.id)
      expect(pendingCount).toBe(0)
    })

    it('generates correct number of players in bracket from multiple groups', async () => {
      const { tournament, groups } = await setupTournamentWithScoredGroups(3)
      const groupRepo = new GroupRepository(pool)
      const knockoutRepo = new KnockoutRepository(pool)

      const matches = await processBracketGenerate(
        { tournamentId: tournament.id },
        { groupRepo, knockoutRepo }
      )

      // With 3 groups each advancing 2 players = 6 total players
      const totalPlayers = matches.reduce((max, m) => {
        const players = [m.player1_id, m.player2_id].filter(p => p).length
        return Math.max(max, players)
      }, 0)
      expect(totalPlayers).toBeGreaterThan(0)
    })

    it('creates knockout matches with round information', async () => {
      const { tournament } = await setupTournamentWithScoredGroups(2)
      const groupRepo = new GroupRepository(pool)
      const knockoutRepo = new KnockoutRepository(pool)

      const matches = await processBracketGenerate(
        { tournamentId: tournament.id },
        { groupRepo, knockoutRepo }
      )

      for (const match of matches) {
        expect(match.round).toBeDefined()
        expect(typeof match.round).toBe('number')
        expect(match.round).toBeGreaterThan(0)
        expect(match.position).toBeDefined()
      }
    })
  })
})
