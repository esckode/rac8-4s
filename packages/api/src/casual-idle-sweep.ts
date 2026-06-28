import { getLogger } from './logger'
import type { Pool } from 'pg'

const log = getLogger('casual-idle-sweep')

export async function sweepIdleCasualTournaments(
  pool: Pool,
  idleDays: number = 7
): Promise<{ swept: number }> {
  // Find casual tournaments in group_stage_active where last activity > idleDays ago
  const findResult = await pool.query(
    `SELECT t.id, t.group_id,
       COUNT(gm.id) FILTER (WHERE gm.status = 'completed') AS scored,
       COUNT(gm.id) AS total
     FROM public.tournaments t
     LEFT JOIN public.group_matches gm ON gm.tournament_id = t.id
     WHERE t.mode = 'casual'
       AND t.status = 'group_stage_active'
       AND (
         NOT EXISTS (
           SELECT 1 FROM public.group_matches gm2
           WHERE gm2.tournament_id = t.id
             AND gm2.updated_at > NOW() - ($1 || ' days')::INTERVAL
         )
         AND t.updated_at < NOW() - ($1 || ' days')::INTERVAL
       )
     GROUP BY t.id, t.group_id`,
    [idleDays]
  )

  let swept = 0

  for (const row of findResult.rows) {
    const tournamentId: string = row.id
    const groupId: string | null = row.group_id
    const scored: number = parseInt(row.scored, 10)
    const total: number = parseInt(row.total, 10)

    await pool.query(
      `UPDATE public.tournaments SET status = $1, updated_at = now() WHERE id = $2`,
      ['abandoned', tournamentId]
    )

    if (groupId) {
      const convResult = await pool.query(
        `SELECT id FROM messaging.conversations WHERE group_id = $1 LIMIT 1`,
        [groupId]
      )
      if (convResult.rows.length > 0) {
        const conversationId: string = convResult.rows[0].id
        const body = `Session ended: ${scored} of ${total} matches played`
        await pool.query(
          `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type)
           VALUES ($1, NULL, 'system', $2, 'system')`,
          [conversationId, body]
        )
      }
    }

    log.info('tournament.idle_archived', { tournamentId, scored, total })
    swept++
  }

  return { swept }
}
