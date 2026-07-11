/**
 * A3.3 — Assistant read-only tool layer (RED first)
 *
 * The registry wall: every tool executes as the asking player through existing
 * repository methods. Scope (design Q5) = tournaments linked to the group
 * (tournaments.group_id) PLUS tournaments the asker is registered in — exactly
 * what the asker can already see in their own UI. Non-group tournaments expose
 * minimal detail (the asker's own rows only).
 *
 * The adversarial-args tests here are the AUTHORITATIVE negative guarantee —
 * they call tools directly with out-of-scope ids, playing the role of a
 * maximally prompt-injected model. No LLM involved.
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository, GroupRepository, TournamentRepository } from '../../db'
import { TournamentFactory } from '../factories'
import { defaultAdultAttestation } from '../factories/player.factory'
import {
  buildAssistantToolContext,
  getMyMatches,
  getStandings,
  getBracket,
  getTournament,
  ASSISTANT_TOOL_NAMES,
  type AssistantToolContext,
} from '../../assistant/tools'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

describe('A3 — assistant read-only tools (auth wall)', () => {
  let pool: Pool
  let playerRepo: PlayerRepository
  let groupRepo: GroupRepository
  let tournamentRepo: TournamentRepository

  // Seeded world (created once for the suite)
  let asker: { id: string; name: string; email: string }
  let mate: { id: string; name: string; email: string }
  let bob: { id: string; name: string; email: string }
  let carol: { id: string; name: string; email: string }
  let playerGroupId: string
  let tournA: string // group-linked; roster asker+mate; one scored match (asker beat mate 2-1)
  let tournB: string // asker registered, NOT group-linked; roster asker+bob
  let tournC: string // private: bob+carol only; asker has no access path
  let tournD: string // group-linked; roster mate+bob (asker NOT registered)
  let ctx: AssistantToolContext

  async function createPlayer(prefix: string): Promise<{ id: string; name: string; email: string }> {
    const email = `${prefix}-${uid()}@test.local`
    const name = `${prefix}-${uid()}`
    const p = await playerRepo.findOrCreatePlayerByEmail(email, name, undefined, undefined, defaultAdultAttestation())
    return { id: p.id, name: p.name ?? name, email: p.email }
  }

  /** Create a tournament with a single round-robin group over the roster. */
  async function createTournamentWithRoster(
    roster: string[],
    opts: { linkToGroup?: string } = {}
  ): Promise<string> {
    const t = await TournamentFactory.create(pool, `organizer_${uid()}`)
    await tournamentRepo.updateStatus(t.id, 'group_stage_active')
    if (opts.linkToGroup) {
      await pool.query(`UPDATE public.tournaments SET group_id = $1 WHERE id = $2`, [opts.linkToGroup, t.id])
    }
    for (const playerId of roster) {
      await playerRepo.createRegistration(playerId, t.id)
    }
    await groupRepo.createGroups(t.id, 1, 2, roster)
    return t.id
  }

  async function scoreFirstMatch(tournamentId: string, winnerId: string, score: string): Promise<void> {
    const groups = await groupRepo.findGroupsByTournament(tournamentId)
    const matches = await groupRepo.findMatchesByGroup(groups[0].id)
    await groupRepo.updateMatch(matches[0].id, winnerId, score)
  }

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
    playerRepo = new PlayerRepository(pool)
    groupRepo = new GroupRepository(pool)
    tournamentRepo = new TournamentRepository(pool)

    asker = await createPlayer('asker')
    mate = await createPlayer('mate')
    bob = await createPlayer('bob')
    carol = await createPlayer('carol')

    const g = await pool.query(
      `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
      [`Tools Group ${uid()}`, asker.id]
    )
    playerGroupId = g.rows[0].id as string

    tournA = await createTournamentWithRoster([asker.id, mate.id], { linkToGroup: playerGroupId })
    await scoreFirstMatch(tournA, asker.id, '2-1')
    tournB = await createTournamentWithRoster([asker.id, bob.id])
    tournC = await createTournamentWithRoster([bob.id, carol.id])
    tournD = await createTournamentWithRoster([mate.id, bob.id], { linkToGroup: playerGroupId })

    ctx = await buildAssistantToolContext(pool, { playerId: asker.id, groupId: playerGroupId })
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('context', () => {
    it('loads the group-linked tournament ids', () => {
      expect(ctx.playerId).toBe(asker.id)
      expect(ctx.groupLinkedTournamentIds.sort()).toEqual([tournA, tournD].sort())
    })
  })

  describe('get_my_matches', () => {
    it("returns the asker's matches across group-linked AND registered tournaments, never others'", async () => {
      const result = await getMyMatches(ctx, {})
      expect('error' in result).toBe(false)
      const matches = (result as any).matches as any[]

      const tournamentIds = matches.map(m => m.tournamentId)
      expect(tournamentIds).toContain(tournA)
      expect(tournamentIds).toContain(tournB)
      expect(tournamentIds).not.toContain(tournC)
      // tournD is group-linked but the asker has no matches in it
      expect(tournamentIds).not.toContain(tournD)

      const aMatch = matches.find(m => m.tournamentId === tournA)
      expect(aMatch.opponentName).toBe(mate.name)
      expect(aMatch.score).toBe('2-1')

      // no emails, ever
      expect(JSON.stringify(result)).not.toContain('@test.local')
    })

    it('with an out-of-scope tournamentId returns not-found, never data', async () => {
      const result = await getMyMatches(ctx, { tournamentId: tournC })
      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
      expect(JSON.stringify(result)).not.toContain(carol.name)
    })
  })

  describe('get_standings', () => {
    it('group-linked tournament → full standings with rankReason', async () => {
      const result = await getStandings(ctx, { tournamentId: tournA })
      expect('error' in result).toBe(false)
      const groups = (result as any).groups as any[]
      expect(groups).toHaveLength(1)
      const rows = groups[0].standings as any[]
      expect(rows).toHaveLength(2)
      expect(rows[0].name).toBe(asker.name) // 1 win beats 0
      expect(rows[0].rankReason).toBeTruthy()
      expect(rows[1].rankReason).toBeTruthy()
      expect(JSON.stringify(result)).not.toContain('@test.local')
    })

    it("group-linked tournament the asker is NOT registered in → still full standings (what the group already sees)", async () => {
      const result = await getStandings(ctx, { tournamentId: tournD })
      expect('error' in result).toBe(false)
      const rows = (result as any).groups[0].standings as any[]
      expect(rows).toHaveLength(2)
    })

    it("asker's non-group tournament → only the asker's own row (minimal detail)", async () => {
      const result = await getStandings(ctx, { tournamentId: tournB })
      expect('error' in result).toBe(false)
      const rows = (result as any).groups.flatMap((g: any) => g.standings) as any[]
      expect(rows).toHaveLength(1)
      expect(rows[0].name).toBe(asker.name)
      expect(JSON.stringify(result)).not.toContain(bob.name)
    })

    it('out-of-scope tournament → not-found, and no private names leak', async () => {
      const result = await getStandings(ctx, { tournamentId: tournC })
      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
      const text = JSON.stringify(result)
      expect(text).not.toContain(bob.name)
      expect(text).not.toContain(carol.name)
    })

    it("another member's ctx cannot reach the asker's private tournament", async () => {
      const mateCtx = await buildAssistantToolContext(pool, { playerId: mate.id, groupId: playerGroupId })
      const result = await getStandings(mateCtx, { tournamentId: tournB })
      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
    })
  })

  describe('get_bracket', () => {
    it('group-linked tournament → bracket (empty rounds are fine)', async () => {
      const result = await getBracket(ctx, { tournamentId: tournA })
      expect('error' in result).toBe(false)
      expect(Array.isArray((result as any).matches)).toBe(true)
    })

    it('out-of-scope tournament → not-found', async () => {
      const result = await getBracket(ctx, { tournamentId: tournC })
      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
    })
  })

  describe('get_tournament', () => {
    it('returns status, deadlines, format, mode for an in-scope tournament', async () => {
      const result = await getTournament(ctx, { tournamentId: tournA })
      expect(result).toMatchObject({
        id: tournA,
        status: 'group_stage_active',
        matchFormat: 'singles',
        mode: 'scheduled',
      })
      expect(result).toHaveProperty('registrationDeadline')
      expect(result).toHaveProperty('groupStageDeadline')
    })

    it('out-of-scope tournament → not-found error object (not a throw)', async () => {
      const result = await getTournament(ctx, { tournamentId: tournC })
      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
    })

    it('nonexistent tournament id → not-found error object', async () => {
      const result = await getTournament(ctx, { tournamentId: `tournament_${uid()}` })
      expect(result).toEqual({ error: 'not_found', message: expect.any(String) })
    })
  })

  describe('registry wall (Phase A structural guarantee)', () => {
    it('the tool registry contains zero write tools', () => {
      expect(ASSISTANT_TOOL_NAMES.length).toBeGreaterThan(0)
      for (const name of ASSISTANT_TOOL_NAMES) {
        expect(name).toMatch(/^get_/)
      }
    })
  })
})
