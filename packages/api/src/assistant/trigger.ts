/**
 * @coach trigger detection + reserved display names (design: reserved literal,
 * case-insensitive, detected server-side before the player-mention parser).
 */

export const ASSISTANT_TRIGGER_NAME = 'coach'
export const ASSISTANT_DISPLAY_NAME = 'Coach'

const TRIGGER_RE = /(^|\s)@coach\b/i

/** True when the message body mentions @coach (case-insensitive, word-boundary). */
export function detectAssistantTrigger(body: string): boolean {
  return TRIGGER_RE.test(body)
}

const RESERVED_DISPLAY_NAMES = [ASSISTANT_TRIGGER_NAME]

/**
 * True when a player display name collides with the assistant's reserved name
 * (trimmed, case-insensitive). Enforced at signup and group invite-accept so no
 * player can impersonate the bot.
 */
export function isReservedDisplayName(name: string): boolean {
  return RESERVED_DISPLAY_NAMES.includes(name.trim().toLowerCase())
}
