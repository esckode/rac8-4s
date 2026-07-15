import { getLogger } from './logger'
import type { Pool } from 'pg'
import { PlayerRepository } from './db'
import { ConversationRepository } from './repositories/conversation-repository'
import { PollRepository } from './repositories/poll-repository'
import { LeaderboardRepository } from './repositories/leaderboard-repository'
import { GroupRepository } from './repositories/group-repository'
import { GroupMessageRepository } from './repositories/group-message-repository'
import { PlayerSettingsRepository, type PlayerSettings } from './repositories/player-settings-repository'
import { StandingsSnapshotRepository } from './repositories/standings-snapshot-repository'
import { AvailabilityRepository, type AvailabilitySlot } from './repositories/availability-repository'
import { PlayerMemoryRepository, type PlayerMemoryRow } from './repositories/player-memory-repository'

const log = getLogger('dsr-service')

export interface PlayerExport {
  playerId: string
  email: string
  name: string
  groups: Array<{ groupId: string; groupName: string; role: string }>
  messageCount: number
  pollVoteCount: number
  matchCount: number
  settings: PlayerSettings
  availability: AvailabilitySlot[]
  /** 1:1 Coach (S8): the player's own rows + Coach's replies in their private thread. */
  coachMessageCount: number
  memories: PlayerMemoryRow[]
  rememberCardCount: number
}

export type EraseResult = { status: 'erased'; playerId: string } | { status: 'not_found' }
export type ExportResult = { status: 'exported'; data: PlayerExport } | { status: 'not_found' }

export class DataSubjectRequestService {
  private playerRepo: PlayerRepository
  private conversationRepo: ConversationRepository
  private pollRepo: PollRepository
  private leaderboardRepo: LeaderboardRepository
  private groupRepo: GroupRepository
  private groupMsgRepo: GroupMessageRepository
  private playerSettingsRepo: PlayerSettingsRepository
  private standingsSnapshotRepo: StandingsSnapshotRepository
  private availabilityRepo: AvailabilityRepository
  private memoryRepo: PlayerMemoryRepository

  constructor(private pool: Pool) {
    this.playerRepo = new PlayerRepository(pool as any)
    this.conversationRepo = new ConversationRepository(pool as any)
    this.pollRepo = new PollRepository(pool as any)
    this.leaderboardRepo = new LeaderboardRepository(pool)
    this.groupRepo = new GroupRepository(pool as any)
    this.groupMsgRepo = new GroupMessageRepository(pool as any)
    this.playerSettingsRepo = new PlayerSettingsRepository(pool as any)
    this.standingsSnapshotRepo = new StandingsSnapshotRepository(pool as any)
    this.availabilityRepo = new AvailabilityRepository(pool as any)
    this.memoryRepo = new PlayerMemoryRepository(pool as any)
  }

  /**
   * Erase all PII for the player identified by email.
   * Idempotent: safe to re-run if a previous run was interrupted.
   * Fan-out order: anonymize data → hard-delete membership → recompute derived views.
   */
  async erase(email: string): Promise<EraseResult> {
    const player = await this.playerRepo.findByEmail(email)
    if (!player) return { status: 'not_found' }

    const playerId = player.id

    // Capture affected groups BEFORE deleting membership (so recompute has the list)
    const groups = await this.groupRepo.getGroupsForPlayer(playerId)

    // Anonymize per-store (idempotent primitives)
    await this.conversationRepo.anonymizeGroupMessagesFor(playerId)
    // Best-effort: scrub the player's exact display name out of Coach's
    // replies (A9.3) — must run before the name is otherwise lost.
    await this.conversationRepo.scrubAssistantMentionsOf(player.name)
    await this.pollRepo.anonymizePollVotesFor(playerId)
    await this.leaderboardRepo.anonymizeMatchLogSlotsFor(playerId)
    await this.groupMsgRepo.deletePersonalThreadFor(playerId)
    await this.playerSettingsRepo.deleteFor(playerId)
    await this.standingsSnapshotRepo.deleteFor(playerId)
    await this.availabilityRepo.deleteFor(playerId)

    // 1:1 Coach (S8, design §5.2): the ids-only args rule breaks deliberately
    // for propose_remember (args carry the actual text) — scrub any remaining
    // remember-card args, explicitly delete player_memories (belt-and-braces;
    // don't rely solely on the FK cascade, which only fires if the player row
    // itself is ever hard-deleted, which erase() never does), then hard-delete
    // the whole coach conversation (cards + messages + the conversation row).
    await this.pool.query(
      `UPDATE messaging.assistant_cards SET args = '{}'::jsonb
       WHERE proposer_player_id = $1 AND action = 'remember'`,
      [playerId]
    )
    await this.memoryRepo.deleteAllFor(playerId)
    await this.groupMsgRepo.deleteCoachThreadFor(playerId)

    // Hard-delete membership
    await this.groupRepo.removeFromAllGroups(playerId)

    // Recompute derived leaderboards for all formerly affected groups
    for (const group of groups) {
      await this.leaderboardRepo.recomputeLeaderboards(group.id)
    }

    log.info('dsr.erased', { playerId })
    return { status: 'erased', playerId }
  }

  /**
   * Export all data held for the player identified by email.
   * Returns a structured summary (counts + group memberships).
   * Read-only — no data is modified.
   */
  async export(email: string): Promise<ExportResult> {
    const player = await this.playerRepo.findByEmail(email)
    if (!player) return { status: 'not_found' }

    const playerId = player.id
    const groups = await this.groupRepo.getGroupsForPlayer(playerId)

    const msgResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM messaging.group_messages WHERE player_id = $1`,
      [playerId]
    )
    const messageCount = Number(msgResult.rows[0].c)

    const voteResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM messaging.poll_votes WHERE player_id = $1`,
      [playerId]
    )
    const pollVoteCount = Number(voteResult.rows[0].c)

    const matchResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM public.group_match_participants WHERE player_id = $1`,
      [playerId]
    )
    const matchCount = Number(matchResult.rows[0].c)

    const settings = await this.playerSettingsRepo.getOrDefaults(playerId)
    const availability = await this.availabilityRepo.getSlots(playerId)

    // 1:1 Coach (S8): it's their own private conversation, so both their own
    // rows AND Coach's replies to them count (unlike group messageCount above,
    // which is scoped to player_id = them only).
    const coachMsgResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM messaging.group_messages gm
       JOIN messaging.conversations c ON c.id = gm.conversation_id
       WHERE c.type = 'coach' AND c.player_id = $1`,
      [playerId]
    )
    const coachMessageCount = Number(coachMsgResult.rows[0].c)
    const memories = await this.memoryRepo.listMemories(playerId)
    const rememberCardResult = await this.pool.query(
      `SELECT COUNT(*) AS c FROM messaging.assistant_cards
       WHERE proposer_player_id = $1 AND action = 'remember'`,
      [playerId]
    )
    const rememberCardCount = Number(rememberCardResult.rows[0].c)

    const data: PlayerExport = {
      playerId,
      email: player.email,
      name: player.name,
      groups: groups.map(g => ({ groupId: g.id, groupName: g.name, role: g.role })),
      messageCount,
      pollVoteCount,
      matchCount,
      settings,
      coachMessageCount,
      memories,
      rememberCardCount,
      availability,
    }

    log.info('dsr.exported', { playerId })
    return { status: 'exported', data }
  }
}
