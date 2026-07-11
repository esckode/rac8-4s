/**
 * A2 — @coach trigger detection (RED first)
 *
 * detectAssistantTrigger: reserved literal '@coach', case-insensitive,
 * word-boundary, anywhere in the body. Checked server-side BEFORE the
 * name-based player-mention parser.
 */

import { detectAssistantTrigger } from '../../assistant/trigger'

describe('detectAssistantTrigger', () => {
  it.each([
    '@coach when is my match',
    '@Coach hi',
    'hey @COACH what are the standings?',
    '@coach',
    'multi\nline @coach question',
    '@coach, comma right after',
    '@coach? question mark',
  ])('matches %j', (body) => {
    expect(detectAssistantTrigger(body)).toBe(true)
  })

  it.each([
    '@coaching tips please',
    'email@coach.com',
    'no trigger here',
    'coach without the at-sign',
    '',
  ])('does not match %j', (body) => {
    expect(detectAssistantTrigger(body)).toBe(false)
  })
})
