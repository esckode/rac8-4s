/**
 * G2.4 — Unit tests for group notify selector: 3-level mute + @mentions + announcements
 *
 * TDD: written RED-first. Will fail until group-notify-selector.ts is implemented.
 *
 * The selector is a pure function — no DB, no side effects.
 * Tests are grouped by the three message types that drive selection:
 *   1. text — only 'all' (+ @mentioned non-muted)
 *   2. poll  — 'all' + 'mentions_polls' (no muted)
 *   3. announcement — 'all' + 'mentions_polls' (no muted)
 *   4. system — no one
 *   5. @mentions cross-cutting rules
 *   6. parseMentions
 */

import {
  selectNotifyRecipients,
  parseMentions,
  type GroupMemberForNotify,
} from '../../group-notify-selector'

/** Convenience: build a member descriptor */
function member(
  playerId: string,
  notifyLevel: 'all' | 'mentions_polls' | 'muted',
  name = `Player-${playerId}`
): GroupMemberForNotify {
  return { playerId, notifyLevel, name }
}

// ── 1. Text message ───────────────────────────────────────────────────────────

describe('selectNotifyRecipients — text message', () => {
  const members = [
    member('A', 'all', 'Alice'),
    member('B', 'mentions_polls', 'Bob'),
    member('C', 'muted', 'Charlie'),
  ]

  it('notifies only "all" members on a plain text chat message', () => {
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: 'Hello everyone',
      senderPlayerId: 'sender',
    })
    expect(result).toContain('A')
    expect(result).not.toContain('B')
    expect(result).not.toContain('C')
  })

  it('does NOT notify muted members even if they have all-level when muted', () => {
    // 'muted' overrides everything (belt-and-suspenders)
    const onlyMuted = [member('Z', 'muted', 'Zara')]
    const result = selectNotifyRecipients({
      members: onlyMuted,
      messageType: 'text',
      body: 'Hey',
      senderPlayerId: 'sender',
    })
    expect(result).not.toContain('Z')
  })

  it('does not notify the sender even if their notify_level is "all"', () => {
    const withSender = [
      member('S', 'all', 'Sam'),   // sender
      member('A', 'all', 'Alice'),
    ]
    const result = selectNotifyRecipients({
      members: withSender,
      messageType: 'text',
      body: 'Hi',
      senderPlayerId: 'S',
    })
    expect(result).not.toContain('S')
    expect(result).toContain('A')
  })
})

// ── 2. Poll message ───────────────────────────────────────────────────────────

describe('selectNotifyRecipients — poll message', () => {
  const members = [
    member('A', 'all', 'Alice'),
    member('B', 'mentions_polls', 'Bob'),
    member('C', 'muted', 'Charlie'),
  ]

  it('notifies "all" AND "mentions_polls" members on a poll message', () => {
    const result = selectNotifyRecipients({
      members,
      messageType: 'poll',
      body: 'Poll: when to play?',
      senderPlayerId: 'sender',
    })
    expect(result).toContain('A')
    expect(result).toContain('B')
    expect(result).not.toContain('C')
  })

  it('does not notify muted members on poll create', () => {
    const result = selectNotifyRecipients({
      members: [member('C', 'muted', 'Charlie')],
      messageType: 'poll',
      body: 'A poll',
      senderPlayerId: 'sender',
    })
    expect(result).not.toContain('C')
  })
})

// ── 3. Announcement message ───────────────────────────────────────────────────

describe('selectNotifyRecipients — announcement message', () => {
  const members = [
    member('A', 'all', 'Alice'),
    member('B', 'mentions_polls', 'Bob'),
    member('C', 'muted', 'Charlie'),
  ]

  it('notifies everyone EXCEPT muted on an announcement', () => {
    const result = selectNotifyRecipients({
      members,
      messageType: 'announcement',
      body: 'Important announcement',
      senderPlayerId: 'sender',
    })
    expect(result).toContain('A')
    expect(result).toContain('B')
    expect(result).not.toContain('C')
  })

  it('muted member is never notified, even for announcements', () => {
    const allMuted = [member('X', 'muted', 'Xena')]
    const result = selectNotifyRecipients({
      members: allMuted,
      messageType: 'announcement',
      body: 'Hear ye',
      senderPlayerId: 'sender',
    })
    expect(result).toHaveLength(0)
  })
})

// ── 4. System message ─────────────────────────────────────────────────────────

describe('selectNotifyRecipients — system message', () => {
  const members = [
    member('A', 'all', 'Alice'),
    member('B', 'mentions_polls', 'Bob'),
    member('C', 'muted', 'Charlie'),
  ]

  it('notifies NO ONE for system events (join/leave)', () => {
    const result = selectNotifyRecipients({
      members,
      messageType: 'system',
      body: 'Alice joined',
      senderPlayerId: '',
    })
    expect(result).toHaveLength(0)
  })
})

describe('selectNotifyRecipients — assistant message (design §11 B-Q11)', () => {
  const members = [
    member('A', 'all', 'Alice'),
    member('B', 'mentions_polls', 'Bob'),
    member('C', 'muted', 'Charlie'),
  ]

  it('notifies NO ONE for a Coach reply or ActionCard, even with an "all"-level member', () => {
    const result = selectNotifyRecipients({
      members,
      messageType: 'assistant',
      body: 'Coach drafted a score.',
      senderPlayerId: '',
    })
    expect(result).toHaveLength(0)
  })

  it('an @mention inside a Coach reply still does not notify (structural, not content-based)', () => {
    const result = selectNotifyRecipients({
      members,
      messageType: 'assistant',
      body: '@Alice, your next match is Saturday.',
      senderPlayerId: '',
    })
    expect(result).toHaveLength(0)
  })
})

// ── 5. @mentions cross-cutting ────────────────────────────────────────────────

describe('selectNotifyRecipients — @mentions', () => {
  it('@mention notifies a "mentions_polls" member who would otherwise be skipped on text', () => {
    const members = [
      member('A', 'all', 'Alice'),
      member('B', 'mentions_polls', 'Bob'),
    ]
    // Bob is @mentioned in a text message — he should get notified despite text-only going to 'all'
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: 'Hey @Bob, check this out',
      senderPlayerId: 'sender',
    })
    expect(result).toContain('A')
    expect(result).toContain('B')
  })

  it('@mention does NOT notify a "muted" member (push suppressed even for @mentions)', () => {
    const members = [
      member('C', 'muted', 'Charlie'),
    ]
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: 'Hey @Charlie!',
      senderPlayerId: 'sender',
    })
    expect(result).not.toContain('C')
  })

  it('@mention of a non-existent member name is silently ignored', () => {
    const members = [
      member('A', 'all', 'Alice'),
    ]
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: '@Nobody hello',
      senderPlayerId: 'sender',
    })
    expect(result).toEqual(['A'])
  })

  it('@mention of sender does not add sender to recipients', () => {
    const members = [
      member('S', 'all', 'Sam'), // sender
      member('B', 'mentions_polls', 'Bob'),
    ]
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: '@Sam says hello @Bob',
      senderPlayerId: 'S',
    })
    expect(result).not.toContain('S')
    expect(result).toContain('B')
  })

  it('deduplicates: @mention of an "all" member does not produce duplicate entries', () => {
    const members = [
      member('A', 'all', 'Alice'),
    ]
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: '@Alice, come see this @Alice',
      senderPlayerId: 'sender',
    })
    expect(result.filter((id: string) => id === 'A').length).toBe(1)
  })

  it('@mention works for names with spaces when quoted', () => {
    const members = [
      member('X', 'mentions_polls', 'Alice Smith'),
    ]
    const result = selectNotifyRecipients({
      members,
      messageType: 'text',
      body: 'Hey @"Alice Smith" are you free?',
      senderPlayerId: 'sender',
    })
    expect(result).toContain('X')
  })
})

// ── 6. parseMentions ─────────────────────────────────────────────────────────

describe('parseMentions', () => {
  it('returns an empty array for text with no @mentions', () => {
    expect(parseMentions('Hello everyone')).toEqual([])
  })

  it('extracts single-word @mention', () => {
    expect(parseMentions('Hey @Alice!')).toContain('Alice')
  })

  it('strips trailing punctuation from @mention', () => {
    expect(parseMentions('@Bob, check this')).toContain('Bob')
  })

  it('extracts multiple @mentions', () => {
    const result = parseMentions('@Alice @Bob hello')
    expect(result).toContain('Alice')
    expect(result).toContain('Bob')
  })

  it('extracts quoted multi-word @mention', () => {
    const result = parseMentions('Hey @"Alice Smith" and @"Bob Jones"')
    expect(result).toContain('Alice Smith')
    expect(result).toContain('Bob Jones')
  })

  it('returns unique mentions (deduplicates)', () => {
    const result = parseMentions('@Alice @Alice @Alice')
    expect(result.filter((n: string) => n === 'Alice').length).toBe(1)
  })
})
