import { Pool } from 'pg'
import { GroupMessageRepository } from '../repositories/group-message-repository'
import { getLogger } from '../logger'

const log = getLogger('teams-formed-processor')

export interface TeamsFormedPayload {
  tournamentId: string
}

interface TeamsFormedProcessorDeps {
  pool: Pool
}

/**
 * Handle the teams.formed job: notify every player whose doubles team was
 * just created by group creation, and every leftover solo who was marked
 * `unpaired`. Runs after the group-creation transaction has committed, so it
 * reads committed state rather than being passed the formed teams directly
 * (ISSUE-19).
 */
export async function processTeamsFormed(
  payload: TeamsFormedPayload,
  deps: TeamsFormedProcessorDeps
): Promise<void> {
  const { tournamentId } = payload
  const { pool } = deps
  const groupMsgRepo = new GroupMessageRepository(pool)

  const tournamentResult = await pool.query('SELECT name FROM public.tournaments WHERE id = $1', [tournamentId])
  const tournamentName = (tournamentResult.rows[0] as { name?: string } | undefined)?.name ?? 'your tournament'

  const teamsResult = await pool.query(
    `SELECT id, player1_id, player2_id FROM public.teams WHERE tournament_id = $1`,
    [tournamentId]
  )
  const teams = teamsResult.rows as { id: string; player1_id: string; player2_id: string }[]

  const nameCache = new Map<string, string>()
  async function nameOf(playerId: string): Promise<string> {
    const cached = nameCache.get(playerId)
    if (cached) return cached
    const r = await pool.query('SELECT name FROM public.players WHERE id = $1', [playerId])
    const name = (r.rows[0] as { name?: string } | undefined)?.name ?? 'your partner'
    nameCache.set(playerId, name)
    return name
  }

  for (const team of teams) {
    const regsResult = await pool.query(
      `SELECT player_id, partner_id, partner_confirmed FROM public.player_registrations
       WHERE tournament_id = $1 AND player_id = ANY($2::text[])`,
      [tournamentId, [team.player1_id, team.player2_id]]
    )
    const regs = regsResult.rows as { player_id: string; partner_id: string | null; partner_confirmed: boolean }[]
    const r1 = regs.find(r => r.player_id === team.player1_id)
    const r2 = regs.find(r => r.player_id === team.player2_id)
    const isChosen = !!(
      r1 && r2 && r1.partner_confirmed && r2.partner_confirmed &&
      r1.partner_id === team.player2_id && r2.partner_id === team.player1_id
    )

    const name1 = await nameOf(team.player1_id)
    const name2 = await nameOf(team.player2_id)

    const body1 = isChosen
      ? `Your team with ${name2} is confirmed for ${tournamentName}`
      : `You've been paired with ${name2} for ${tournamentName}`
    const body2 = isChosen
      ? `Your team with ${name1} is confirmed for ${tournamentName}`
      : `You've been paired with ${name1} for ${tournamentName}`

    await groupMsgRepo.postPersonalNotification(team.player1_id, body1, { tournamentId })
    await groupMsgRepo.postPersonalNotification(team.player2_id, body2, { tournamentId })
  }

  const unpairedResult = await pool.query(
    `SELECT player_id FROM public.player_registrations WHERE tournament_id = $1 AND status = 'unpaired'`,
    [tournamentId]
  )
  const unpaired = unpairedResult.rows as { player_id: string }[]
  for (const row of unpaired) {
    await groupMsgRepo.postPersonalNotification(
      row.player_id,
      `You weren't paired with a partner for ${tournamentName}`,
      { tournamentId }
    )
  }

  log.info('teams.formed.notified', { tournamentId, teamCount: teams.length, unpairedCount: unpaired.length })
}
