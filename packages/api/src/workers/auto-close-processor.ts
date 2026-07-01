import type { Pool } from 'pg'
import { PollRepository } from '../repositories/poll-repository'
import { TournamentRepository, PlayerRepository } from '../db'
import { ConversationRepository } from '../repositories/conversation-repository'
import { getLogger } from '../logger'

const log = getLogger('auto-close-processor')

export interface AutoCloseSweepDeps {
  pool: Pool
  now?: Date
}

async function postSystemMessage(
  pool: Pool,
  conversationId: string,
  body: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO messaging.group_messages (conversation_id, player_id, sender_name_snapshot, body, type, metadata)
     VALUES ($1, NULL, 'system', $2, 'system', $3)`,
    [conversationId, body, metadata ? JSON.stringify(metadata) : null],
  )
}

async function tryAutoLaunch(
  pool: Pool,
  row: {
    message_id: string
    group_id: string
    creator_player_id: string | null
    auto_launch: boolean
    min_players: number | null
    launch_match_format: string | null
  },
): Promise<void> {
  const { message_id: messageId, group_id: groupId } = row
  if (!row.auto_launch) return

  const conversationRepo = new ConversationRepository(pool as any)
  const conversationId = await conversationRepo.resolveGroupConversation(groupId)

  // Check creator is still a member
  const creatorId = row.creator_player_id
  if (creatorId) {
    const memberCheck = await pool.query(
      `SELECT 1 FROM public.player_group_members WHERE group_id = $1 AND player_id = $2`,
      [groupId, creatorId],
    )
    if (memberCheck.rows.length === 0) {
      await postSystemMessage(pool, conversationId, 'Auto-launch skipped: poll creator is no longer a group member.')
      log.info('auto_launch.creator_left', { messageId, groupId, creatorId })
      return
    }
  }

  // Get in-voters
  const votersResult = await pool.query(
    `SELECT player_id FROM messaging.poll_votes
     WHERE message_id = $1 AND choice = 'in' AND player_id IS NOT NULL`,
    [messageId],
  )
  const inVoters: string[] = votersResult.rows.map((r: { player_id: string }) => r.player_id)

  // Check min_players threshold
  const minPlayers = row.min_players ?? null
  if (minPlayers !== null && inVoters.length < minPlayers) {
    const body = `Only ${inVoters.length} in, needed ${minPlayers} — no game.`
    await postSystemMessage(pool, conversationId, body)
    log.info('auto_launch.below_threshold', { messageId, groupId, inCount: inVoters.length, minPlayers })
    return
  }

  // Load group name
  const groupResult = await pool.query(
    `SELECT name, default_match_format FROM public.player_groups WHERE id = $1`,
    [groupId],
  )
  const group = groupResult.rows[0] as { name: string; default_match_format: string | null }

  const matchFormatRaw = row.launch_match_format ?? group.default_match_format ?? 'singles'
  const matchFormat: 'singles' | 'doubles' = matchFormatRaw === 'doubles' ? 'doubles' : 'singles'

  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const tournamentName = `${group.name} — ${dateLabel}`

  const tournamentRepo = new TournamentRepository(pool as any)
  const playerRepo = new PlayerRepository(pool as any)

  const tournament = await tournamentRepo.create({
    name: tournamentName,
    sport: 'tennis',
    matchFormat,
    maxPlayers: inVoters.length || 1,
    creatorId: creatorId ?? inVoters[0],
    mode: 'casual',
    visibility: 'unlisted',
    groupId,
  })

  for (const voterId of inVoters) {
    await playerRepo.createRegistration(voterId, tournament.id)
  }

  await tournamentRepo.updateStatus(tournament.id, 'registration_closed')

  await postSystemMessage(pool, conversationId, `Tournament started: ${tournament.name}`, { tournament_id: tournament.id })

  log.info('auto_launch.tournament.created', {
    tournamentId: tournament.id,
    groupId,
    pollMessageId: messageId,
    playerCount: inVoters.length,
  })
}

/**
 * Auto-close sweep (P3.3 + P3.4).
 *
 * Queries for all polls with auto_close_at <= :now AND closed_at IS NULL.
 * For each, delegates to PollRepository.closePoll which freezes the tally
 * and posts the system follow-up message. If auto_launch=true, attempts to
 * launch a casual tournament for in-voters. Idempotent.
 */
export async function processAutoCloseSweep(deps: AutoCloseSweepDeps): Promise<void> {
  const { pool, now = new Date() } = deps
  const pollRepo = new PollRepository(pool as any)

  const result = await pool.query(
    `SELECT p.id AS poll_id, p.message_id, c.group_id,
            p.creator_player_id, p.auto_launch, p.min_players, p.launch_match_format
     FROM messaging.polls p
     JOIN messaging.group_messages gm ON gm.id = p.message_id
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE p.auto_close_at <= $1
       AND p.closed_at IS NULL
       AND p.auto_close_at IS NOT NULL`,
    [now],
  )

  if (result.rows.length === 0) {
    log.debug('auto_close.sweep.nothing', { now: now.toISOString() })
    return
  }

  let closed = 0
  let skipped = 0

  for (const row of result.rows) {
    const { message_id: messageId, group_id: groupId } = row as {
      poll_id: string
      message_id: string
      group_id: string
    }

    try {
      await pollRepo.closePoll(messageId, groupId, 'system')
      closed++
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'POLL_ALREADY_CLOSED') {
        skipped++
        continue
      } else {
        log.error('auto_close.poll.failed', {
          messageId,
          groupId,
          message: err instanceof Error ? err.message : String(err),
        })
        continue
      }
    }

    try {
      await tryAutoLaunch(pool, row as {
        message_id: string
        group_id: string
        creator_player_id: string | null
        auto_launch: boolean
        min_players: number | null
        launch_match_format: string | null
      })
    } catch (err: unknown) {
      log.error('auto_launch.failed', {
        messageId,
        groupId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  log.info('auto_close.sweep.done', { closed, skipped, total: result.rows.length })
}
