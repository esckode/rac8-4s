/**
 * G2.4 — Group notification selector: 3-level mute + @mentions + announcements.
 *
 * Pure function — no DB, no side effects. Given a list of group members (each with
 * their notify_level and display name), a message type, and a message body, it returns
 * the set of player IDs that should receive a push notify job.
 *
 * Selection rules (§11.7 / PLAYER_GROUPS_DESIGN.md):
 *
 *   text        → notify 'all' members PLUS any @mentioned non-muted members
 *   poll        → notify 'all' + 'mentions_polls' (never 'muted')
 *   announcement→ notify 'all' + 'mentions_polls' (never 'muted')
 *   system      → no notifications
 *
 * @mentions: parse @name / @"Full Name" patterns from the body; the mentioned
 * member is notified regardless of whether their tier would normally include chat
 * notifications — EXCEPT if they are 'muted' (muted suppresses ALL push, including
 * @mentions, per §11.7).
 *
 * The sender is always excluded from the recipients set (you don't notify yourself).
 *
 * The returned array is deduplicated and does not include the sender.
 *
 * "muted" members still receive the in-app unread badge (via the unread-count DB
 * column, not via this function) — this function only governs push/email notifications.
 */

export type NotifyLevel = 'all' | 'mentions_polls' | 'muted'
export type GroupMessageType = 'text' | 'poll' | 'system' | 'announcement'

export interface GroupMemberForNotify {
  playerId: string
  notifyLevel: NotifyLevel
  /** Display name at the time of the call — used for @mention matching */
  name: string
}

export interface SelectNotifyRecipientsInput {
  members: GroupMemberForNotify[]
  messageType: GroupMessageType
  body: string
  /** The player who sent the message — excluded from recipients */
  senderPlayerId: string
}

/**
 * Parse @mention tokens from a message body.
 *
 * Supported forms:
 *   @Word          — single-word name (stops at whitespace or punctuation)
 *   @"Full Name"   — multi-word name enclosed in double quotes
 *
 * Returns unique, deduplicated mention strings (the names without the @ prefix).
 */
export function parseMentions(body: string): string[] {
  const mentions = new Set<string>()

  // Match @"Multi Word" first (quoted form)
  const quotedRe = /@"([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = quotedRe.exec(body)) !== null) {
    mentions.add(m[1])
  }

  // Then match @Word (single-word, unquoted)
  // Strip trailing punctuation that isn't part of the name
  const wordRe = /@([A-Za-z0-9_-]+)/g
  while ((m = wordRe.exec(body)) !== null) {
    mentions.add(m[1])
  }

  return Array.from(mentions)
}

/**
 * Select the player IDs that should receive a messaging.notify push job.
 *
 * Returns a deduplicated array of player IDs (not including the sender).
 */
export function selectNotifyRecipients(input: SelectNotifyRecipientsInput): string[] {
  const { members, messageType, body, senderPlayerId } = input

  // System events never trigger push notifications
  if (messageType === 'system') {
    return []
  }

  const recipients = new Set<string>()

  // Build a name→playerId map for @mention resolution
  const nameToPlayerId = new Map<string, string>()
  for (const m of members) {
    nameToPlayerId.set(m.name.toLowerCase(), m.playerId)
  }

  // Determine base recipient set by message type
  for (const m of members) {
    if (m.notifyLevel === 'muted') continue
    if (m.playerId === senderPlayerId) continue

    if (messageType === 'text') {
      // text: only 'all' members receive baseline notifications
      if (m.notifyLevel === 'all') {
        recipients.add(m.playerId)
      }
    } else if (messageType === 'poll' || messageType === 'announcement') {
      // poll and announcement: 'all' + 'mentions_polls'
      recipients.add(m.playerId)
    }
  }

  // @mention upgrade: parse @names and add the mentioned members (if not muted, not sender)
  if (messageType === 'text') {
    const mentionedNames = parseMentions(body)
    for (const mentionName of mentionedNames) {
      const playerId = nameToPlayerId.get(mentionName.toLowerCase())
      if (!playerId) continue
      if (playerId === senderPlayerId) continue

      // Find the member to check their mute level
      const member = members.find(m => m.playerId === playerId)
      if (!member || member.notifyLevel === 'muted') continue

      recipients.add(playerId)
    }
  }

  return Array.from(recipients)
}
