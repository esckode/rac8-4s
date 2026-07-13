/**
 * Shared dedupe/cap primitives for Phase C proactive sweeps (nudge, recap,
 * digest). All three post via the same metadata.nudge marker scheme (the A4
 * replyTo-guard pattern) and share one daily proactive-post ledger — see
 * design §11 C0. The name "nudge" on the metadata key predates recap/digest
 * but is kept as-is (all three sweeps write to it) rather than migrating
 * existing rows for a cosmetic rename.
 */
import { Pool } from 'pg'

export const MAX_PROACTIVE_POSTS_PER_DAY = 2

export async function proactiveMarkerExists(pool: Pool, groupId: string, marker: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM messaging.group_messages gm
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE c.group_id = $1 AND gm.type = 'assistant' AND gm.metadata->>'nudge' = $2
     LIMIT 1`,
    [groupId, marker]
  )
  return res.rows.length > 0
}

export async function proactivePostsToday(pool: Pool, groupId: string, todayStartUtc: Date): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) AS count
     FROM messaging.group_messages gm
     JOIN messaging.conversations c ON c.id = gm.conversation_id
     WHERE c.group_id = $1 AND gm.type = 'assistant' AND gm.metadata->>'nudge' IS NOT NULL
       AND gm.created_at >= $2`,
    [groupId, todayStartUtc]
  )
  return Number(res.rows[0].count)
}
