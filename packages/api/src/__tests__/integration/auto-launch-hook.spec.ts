/**
 * P3.4 — Auto-launch hook + min-count + edge rules (RED tests)
 *
 * Tests:
 *   1. auto_launch=true, in_count >= min_players → tournament launched
 *   2. auto_launch=true, in_count < min_players → "no game" system message, no tournament
 *   3. auto_launch=true, min_players=null (any count) → always launches when there are in-voters
 *   4. auto_launch=true, creator no longer a member → system message, no tournament
 *   5. auto_launch=false → poll closes but no tournament launched
 *   6. idempotent: running sweep twice does NOT launch two tournaments
 */

import { Pool } from 'pg'
import crypto from 'crypto'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { defaultAdultAttestation } from '../factories/player.factory'
import { processAutoCloseSweep } from '../../workers/auto-close-processor'

function uid(): string {
  return crypto.randomUUID().slice(0, 8)
}

async function createPlayer(pool: Pool): Promise<{ id: string; email: string; name: string }> {
  const repo = new PlayerRepository(pool)
  const email = `al-${uid()}@test.local`
  const name = `Player ${uid()}`
  const player = await repo.findOrCreatePlayerByEmail(
    email, name, undefined, undefined, defaultAdultAttestation(),
  )
  return { id: player.id, email: player.email, name: player.name ?? name }
}

async function createGroup(pool: Pool, ownerId: string): Promise<string> {
  const res = await pool.query(
    `INSERT INTO public.player_groups (name, created_by) VALUES ($1, $2) RETURNING id`,
    [`al-grp-${uid()}`, ownerId],
  )
  const groupId = res.rows[0].id as string
  await pool.query(
    `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'owner')`,
    [groupId, ownerId],
  )
  return groupId
}

interface PollSetup {
  pollId: string
  messageId: string
  conversationId: string
}

async function createAutoLaunchPoll(
  pool: Pool,
  groupId: string,
  creatorId: string,
  opts: {
    pastDue?: boolean
    autoLaunch?: boolean
    minPlayers?: number | null
    launchMatchFormat?: string | null
  } = {},
): Promise<PollSetup> {
  const {
    pastDue = true,
    autoLaunch = true,
    minPlayers = null,
    launchMatchFormat = null,
  } = opts

  // Resolve group conversation
  const convRes = await pool.query(
    `INSERT INTO messaging.conversations (type, group_id)
     VALUES ('group', $1)
     ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [groupId],
  )
  let conversationId: string
  if (convRes.rows.length > 0) {
    conversationId = convRes.rows[0].id as string
  } else {
    const sel = await pool.query(
      `SELECT id FROM messaging.conversations WHERE group_id = $1`,
      [groupId],
    )
    conversationId = sel.rows[0].id as string
  }

  const msgRes = await pool.query(
    `INSERT INTO messaging.group_messages
       (conversation_id, player_id, sender_name_snapshot, body, type)
     VALUES ($1, $2, 'Player', 'Are you in?', 'poll')
     RETURNING id`,
    [conversationId, creatorId],
  )
  const messageId = msgRes.rows[0].id as string

  const autoCloseAt = pastDue ? new Date(Date.now() - 60_000) : new Date(Date.now() + 3_600_000)

  const pollRes = await pool.query(
    `INSERT INTO messaging.polls
       (message_id, question, creator_player_id, auto_close_at, auto_launch, min_players, launch_match_format)
     VALUES ($1, 'Are you in?', $2, $3, $4, $5, $6)
     RETURNING id`,
    [messageId, creatorId, autoCloseAt, autoLaunch, minPlayers, launchMatchFormat],
  )
  const pollId = pollRes.rows[0].id as string

  return { pollId, messageId, conversationId }
}

async function addVote(pool: Pool, messageId: string, playerId: string, choice: string): Promise<void> {
  await pool.query(
    `INSERT INTO messaging.poll_votes (message_id, player_id, choice)
     VALUES ($1, $2, $3) ON CONFLICT (message_id, player_id) DO UPDATE SET choice = $3`,
    [messageId, playerId, choice],
  )
}

async function countTournaments(pool: Pool, groupId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) AS n FROM public.tournaments WHERE group_id = $1`,
    [groupId],
  )
  return Number(res.rows[0].n)
}

async function getSystemMessages(pool: Pool, conversationId: string): Promise<string[]> {
  const res = await pool.query(
    `SELECT body FROM messaging.group_messages
     WHERE conversation_id = $1 AND type = 'system'
     ORDER BY created_at`,
    [conversationId],
  )
  return res.rows.map((r: any) => r.body as string)
}

let pool: Pool

describe('P3.4 — Auto-launch hook', () => {
  // Nested one level inside the describe (rather than at file top-level) so this
  // afterAll runs — and releases the suite connection — before the global afterAll
  // in setup.ts calls closeTestPool(). Same-scope afterAll hooks run in registration
  // order, so a top-level afterAll here would race the global one and pool.end()
  // would hang forever waiting for this still-checked-out client.
  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  it('launches a tournament when in_count >= min_players', async () => {
    const creator = await createPlayer(pool)
    const voter1 = await createPlayer(pool)
    const voter2 = await createPlayer(pool)
    const groupId = await createGroup(pool, creator.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member'), ($1, $3, 'member')`,
      [groupId, voter1.id, voter2.id],
    )

    const { messageId, conversationId } = await createAutoLaunchPoll(pool, groupId, creator.id, {
      autoLaunch: true, minPlayers: 2, launchMatchFormat: 'singles',
    })
    await addVote(pool, messageId, creator.id, 'in')
    await addVote(pool, messageId, voter1.id, 'in')

    await processAutoCloseSweep({ pool })

    expect(await countTournaments(pool, groupId)).toBe(1)
    const msgs = await getSystemMessages(pool, conversationId)
    expect(msgs.some(m => m.toLowerCase().includes('tournament'))).toBe(true)
  })

  it('posts "no game" message when in_count < min_players, no tournament', async () => {
    const creator = await createPlayer(pool)
    const groupId = await createGroup(pool, creator.id)

    const { messageId, conversationId } = await createAutoLaunchPoll(pool, groupId, creator.id, {
      autoLaunch: true, minPlayers: 4,
    })
    await addVote(pool, messageId, creator.id, 'in') // only 1 in, need 4

    await processAutoCloseSweep({ pool })

    expect(await countTournaments(pool, groupId)).toBe(0)
    const msgs = await getSystemMessages(pool, conversationId)
    const noGameMsg = msgs.find(m => m.toLowerCase().includes('needed') || m.toLowerCase().includes('no game') || m.includes('4'))
    expect(noGameMsg).toBeDefined()
  })

  it('launches when min_players is null (any in-count)', async () => {
    const creator = await createPlayer(pool)
    const groupId = await createGroup(pool, creator.id)

    const { messageId } = await createAutoLaunchPoll(pool, groupId, creator.id, {
      autoLaunch: true, minPlayers: null,
    })
    await addVote(pool, messageId, creator.id, 'in')

    await processAutoCloseSweep({ pool })

    expect(await countTournaments(pool, groupId)).toBe(1)
  })

  it('skips launch when creator is no longer a member, posts system message', async () => {
    const creator = await createPlayer(pool)
    const voter = await createPlayer(pool)
    const groupId = await createGroup(pool, creator.id)
    await pool.query(
      `INSERT INTO public.player_group_members (group_id, player_id, role) VALUES ($1, $2, 'member')`,
      [groupId, voter.id],
    )

    const { messageId, conversationId } = await createAutoLaunchPoll(pool, groupId, creator.id, {
      autoLaunch: true, minPlayers: 1,
    })
    await addVote(pool, messageId, voter.id, 'in')

    // Creator leaves the group
    await pool.query(
      `DELETE FROM public.player_group_members WHERE group_id = $1 AND player_id = $2`,
      [groupId, creator.id],
    )

    await processAutoCloseSweep({ pool })

    expect(await countTournaments(pool, groupId)).toBe(0)
    const msgs = await getSystemMessages(pool, conversationId)
    expect(msgs.some(m => m.toLowerCase().includes('creator') || m.toLowerCase().includes('member') || m.toLowerCase().includes('launch'))).toBe(true)
  })

  it('does NOT launch when auto_launch=false', async () => {
    const creator = await createPlayer(pool)
    const groupId = await createGroup(pool, creator.id)

    const { messageId } = await createAutoLaunchPoll(pool, groupId, creator.id, {
      autoLaunch: false,
    })
    await addVote(pool, messageId, creator.id, 'in')

    await processAutoCloseSweep({ pool })

    expect(await countTournaments(pool, groupId)).toBe(0)
  })

  it('is idempotent: running sweep twice does not launch two tournaments', async () => {
    const creator = await createPlayer(pool)
    const groupId = await createGroup(pool, creator.id)

    const { messageId } = await createAutoLaunchPoll(pool, groupId, creator.id, {
      autoLaunch: true, minPlayers: 1,
    })
    await addVote(pool, messageId, creator.id, 'in')

    await processAutoCloseSweep({ pool })
    await processAutoCloseSweep({ pool })

    expect(await countTournaments(pool, groupId)).toBe(1)
  })
})
