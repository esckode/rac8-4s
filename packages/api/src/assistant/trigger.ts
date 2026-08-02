/**
 * @ref trigger detection + reserved display names (design: reserved literal,
 * case-insensitive, detected server-side before the player-mention parser).
 * Renamed from the group surface's original trigger (Phase N, design §12 N-Q5).
 */

export const ASSISTANT_TRIGGER_NAME = 'ref'
export const ASSISTANT_DISPLAY_NAME = 'Ref'

const TRIGGER_RE = /(^|\s)@ref\b/i

/** True when the message body mentions @ref (case-insensitive, word-boundary). */
export function detectAssistantTrigger(body: string): boolean {
  return TRIGGER_RE.test(body)
}

/**
 * Explicit literal, not derived from ASSISTANT_TRIGGER_NAME (design §12 N-Q7):
 * 'coach' stays reserved after the rename so the retired identity can't be
 * registered and used to impersonate the bot's historical messages.
 */
const RESERVED_DISPLAY_NAMES = ['ref', 'coach']

/**
 * True when a player display name collides with the assistant's reserved name
 * (trimmed, case-insensitive). Enforced at signup and group invite-accept so no
 * player can impersonate the bot.
 */
export function isReservedDisplayName(name: string): boolean {
  return RESERVED_DISPLAY_NAMES.includes(name.trim().toLowerCase())
}
