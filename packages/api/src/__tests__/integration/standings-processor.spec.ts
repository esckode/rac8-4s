import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { GroupRepository, TournamentRepository } from '../../db'
import { processStandingsRecalculate } from '../../workers/standings-processor'
import { TournamentFactory, PlayerFactory } from '../factories'

describe('Standings Processor', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function setupTournamentWithGroup(numPlayers: number = 3) {
    const organizerId = `org_test_${Date.now()}_${Math.random()}`
    const tournament = await TournamentFactory.create(pool, organizerId)
    const tournamentRepo = new TournamentRepository(pool)
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

    // Create and register players
    const playerIds: string[] = []
    for (let i = 0; i < numPlayers; i++) {
      const player = await PlayerFactory.create(pool)
      await PlayerFactory.createAndRegister(pool, tournament.id, {
        email: player.email,
        name: player.name,
      })
      playerIds.push(player.id)
    }

    // Create group
    const groupRepo = new GroupRepository(pool)
    const groups = await groupRepo.createGroups(tournament.id, 1, 1, playerIds)
    const group = groups[0]

    return { tournament, group, playerIds }
  }

  async function scoreGroupMatches(groupId: string) {
    const groupRepo = new GroupRepository(pool)
    const matches = await groupRepo.findMatchesByGroup(groupId)
    for (const m of matches) {
      await groupRepo.updateMatch(m.id, m.player1_id!, '6-3 6-4')
    }
  }

  describe('processStandingsRecalculate', () => {
    it('calculates standings from completed group matches', async () => {
      const { tournament, group, playerIds } = await setupTournamentWithGroup(3)
      const groupRepo = new GroupRepository(pool)

      // Score all matches
      await scoreGroupMatches(group.id)

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      expect(Array.isArray(standings)).toBe(true)
      expect(standings.length).toBe(playerIds.length)
      // Standings should have participant IDs
      for (const standing of standings) {
        expect(standing.participantId).toBeDefined()
      }
    })

    it('handles group with no completed matches', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)

      // Do NOT score matches
      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      expect(Array.isArray(standings)).toBe(true)
      expect(standings.length).toBeGreaterThan(0)
      // All should have 0 wins since no matches scored
      for (const standing of standings) {
        expect(standing.wins).toBe(0)
        expect(standing.losses).toBe(0)
      }
    })

    it('clears standings cache before recalculating', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)
      const mockCache = { clear: jest.fn(), set: jest.fn() }

      await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo, standingsCache: mockCache as any }
      )

      expect(mockCache.clear).toHaveBeenCalledWith(group.id)
    })

    it('updates standings cache with calculated standings', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)
      const mockCache = { clear: jest.fn(), set: jest.fn() }

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo, standingsCache: mockCache as any }
      )

      expect(mockCache.set).toHaveBeenCalledWith(group.id, standings)
    })

    it('broadcasts standings.updated event', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)
      const mockBus = { emit: jest.fn() }

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo, broadcastBus: mockBus as any }
      )

      expect(mockBus.emit).toHaveBeenCalledWith(
        tournament.id,
        'standings.updated',
        expect.objectContaining({
          groupId: group.id,
          standings,
        })
      )
    })

    it('works without optional cache dependency', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      expect(Array.isArray(standings)).toBe(true)
      expect(standings.length).toBeGreaterThan(0)
    })

    it('works without optional broadcastBus dependency', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      expect(Array.isArray(standings)).toBe(true)
      expect(standings.length).toBeGreaterThan(0)
    })

    it('works without both optional dependencies', async () => {
      const { tournament, group } = await setupTournamentWithGroup(3)
      const groupRepo = new GroupRepository(pool)

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      expect(Array.isArray(standings)).toBe(true)
      expect(standings.length).toBe(3)
    })

    it('recalculates standings after scoring matches', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)

      // First recalculation with no scored matches
      const standings1 = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      // Score all matches
      await scoreGroupMatches(group.id)

      // Second recalculation with scored matches
      const standings2 = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      // Second should have different standings due to match results
      const winner1 = standings1[0].participantId
      const winner2 = standings2[0].participantId
      // The actual winner should have moved up
      expect(standings2[0].wins).toBeGreaterThan(standings1[0].wins)
    })

    it('orders standings correctly by wins', async () => {
      const { tournament, group } = await setupTournamentWithGroup(3)
      const groupRepo = new GroupRepository(pool)

      // Score all matches
      await scoreGroupMatches(group.id)

      const standings = await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo }
      )

      // Check ordering: standings should be sorted by wins descending
      for (let i = 0; i < standings.length - 1; i++) {
        expect(standings[i].wins).toBeGreaterThanOrEqual(standings[i + 1].wins)
      }
    })

    it('cache clear happens before set', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)

      const callOrder: string[] = []
      const mockCache = {
        clear: jest.fn(() => callOrder.push('clear')),
        set: jest.fn(() => callOrder.push('set')),
      }

      await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo, standingsCache: mockCache as any }
      )

      expect(callOrder).toEqual(['clear', 'set'])
    })

    it('includes groupId in broadcast event', async () => {
      const { tournament, group } = await setupTournamentWithGroup(2)
      const groupRepo = new GroupRepository(pool)
      const mockBus = { emit: jest.fn() }

      await processStandingsRecalculate(
        { tournamentId: tournament.id, groupId: group.id },
        { groupRepo, broadcastBus: mockBus as any }
      )

      const callArgs = mockBus.emit.mock.calls[0]
      expect(callArgs[2].groupId).toBe(group.id)
    })
  })
})
