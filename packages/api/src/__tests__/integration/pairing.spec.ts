/**
 * P13 Phase 11 (R26) — rating-based pairing removed.
 *
 * createGroupsForDoubles (db.ts) no longer reads player_ratings when pairing
 * consenting solo leftovers — R27 made the rating display-only, and R20's
 * pairing produced one distinct partner per player across ten tournaments
 * (design §3c), so the rating-based selection was deleted. Consenting
 * leftovers now pair by plain random shuffle, exactly as before Phase 8 ever
 * ran. ISSUE-17's auto_pair_consent gate still holds regardless.
 */
import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { TournamentFactory, OrganizerFactory, PlayerFactory } from '../factories'
import { TournamentRepository, PlayerRepository, GroupRepository } from '../../db'

describe('P13 Phase 11 (R26) — auto-pairing no longer reads ratings', () => {
  let pool: Pool
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    tournamentRepo = new TournamentRepository(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  async function openDoublesTournament() {
    const organizerId = OrganizerFactory.id()
    const tournament = await TournamentFactory.create(pool, organizerId, { matchFormat: 'doubles' })
    await tournamentRepo.updateStatus(tournament.id, 'registration_closed')
    return tournament
  }

  async function soloRegister(tournamentId: string, autoPairConsent = true) {
    const player = await PlayerFactory.create(pool)
    await playerRepo.createRegistration(player.id, tournamentId, autoPairConsent)
    return player
  }

  async function teamsFor(tournamentId: string) {
    const result = await pool.query(
      `SELECT player1_id, player2_id FROM public.teams WHERE tournament_id = $1`,
      [tournamentId]
    )
    return result.rows as { player1_id: string; player2_id: string }[]
  }

  it('an all-consenting leftover roster is fully paired (regression guard against ISSUE-31)', async () => {
    const tournament = await openDoublesTournament()
    const players = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])

    await groupRepo.createGroupsForDoubles(tournament.id, 1, 1, players.map(p => p.id), true)

    const teams = await teamsFor(tournament.id)
    const teamed = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    for (const p of players) {
      expect(teamed.has(p.id)).toBe(true)
    }
  })

  it('a player with auto_pair_consent=false is still excluded (ISSUE-17)', async () => {
    const tournament = await openDoublesTournament()
    const optedOut = await soloRegister(tournament.id, false)
    const others = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])

    await groupRepo.createGroupsForDoubles(
      tournament.id,
      1,
      1,
      [optedOut, ...others].map(p => p.id),
      true
    )

    const teams = await teamsFor(tournament.id)
    const teamed = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    expect(teamed.has(optedOut.id)).toBe(false)

    const reg = await playerRepo.findRegistration(optedOut.id, tournament.id)
    expect(reg?.status).toBe('unpaired')
  })

  it('an odd number of consenting leftovers leaves exactly one unpaired, marked unpaired', async () => {
    const tournament = await openDoublesTournament()
    const players = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])

    await groupRepo.createGroupsForDoubles(tournament.id, 1, 1, players.map(p => p.id), true)

    const teams = await teamsFor(tournament.id)
    const teamed = new Set(teams.flatMap(t => [t.player1_id, t.player2_id]))
    const unteamed = players.filter(p => !teamed.has(p.id))
    expect(unteamed).toHaveLength(1)

    const reg = await playerRepo.findRegistration(unteamed[0].id, tournament.id)
    expect(reg?.status).toBe('unpaired')
  })

  it('no query touches player_ratings during group creation', async () => {
    const tournament = await openDoublesTournament()
    const players = await Promise.all([
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
      soloRegister(tournament.id),
    ])

    const client = await pool.connect()
    const querySpy = jest.spyOn(client, 'query')
    try {
      await groupRepo.createGroupsForDoubles(tournament.id, 1, 1, players.map(p => p.id), true)
    } finally {
      const touchedRatings = querySpy.mock.calls.some(
        ([text]) => typeof text === 'string' && /player_ratings/i.test(text)
      )
      querySpy.mockRestore()
      expect(touchedRatings).toBe(false)
    }
  })
})
