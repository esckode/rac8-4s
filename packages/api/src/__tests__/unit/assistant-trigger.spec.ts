/**
 * A2 — @ref trigger detection (RED first)
 * N2 (Phase N, design §12 N-Q5) — renamed from @coach.
 *
 * detectAssistantTrigger: reserved literal '@ref', case-insensitive,
 * word-boundary, anywhere in the body. Checked server-side BEFORE the
 * name-based player-mention parser. '@coach' no longer triggers.
 */

import { detectAssistantTrigger, isReservedDisplayName } from '../../assistant/trigger'

describe('detectAssistantTrigger', () => {
  it.each([
    '@ref when is my match',
    '@Ref hi',
    'hey @REF what are the standings?',
    '@ref',
    'multi\nline @ref question',
    '@ref, comma right after',
    '@ref? question mark',
  ])('matches %j', (body) => {
    expect(detectAssistantTrigger(body)).toBe(true)
  })

  it.each([
    '@reffing tips please',
    'email@ref.com',
    'no trigger here',
    'ref without the at-sign',
    '',
    '@coach hello',
    '@Coach hi',
    'hey @COACH what are the standings?',
  ])('does not match %j', (body) => {
    expect(detectAssistantTrigger(body)).toBe(false)
  })
})

describe('isReservedDisplayName', () => {
  it.each(['ref', 'Ref', 'REF ', ' ref ', 'coach', 'Coach', 'COACH ', ' coach '])(
    'rejects %j',
    (name) => {
      expect(isReservedDisplayName(name)).toBe(true)
    }
  )

  it.each(['Refree Bob', 'Coachman Bob', 'Casey', ''])('accepts %j', (name) => {
    expect(isReservedDisplayName(name)).toBe(false)
  })
})
