/**
 * emit-card — senderName on the broadcast payload (N3b, Phase N).
 *
 * emitCardCreated feeds both the group surface (propose-score/poll/pollVote/
 * casualLaunch, always a real groupId) and the 1:1 surface (propose-remember,
 * groupId explicitly null) — the two must not share a sender name after the
 * rename, so the payload discriminates on the groupId parameter it already
 * receives, matching sender_name_snapshot's own group/1:1 split at the DB layer
 * (assistant-card-repository.ts's createCard vs createCoachCard).
 */

import { emitCardCreated } from '../../assistant/emit-card'
import type { AssistantCardRow } from '../../repositories/assistant-card-repository'

function makeCard(): AssistantCardRow {
  return {
    id: 'card-1',
    messageId: 'msg-1',
    groupId: null,
    conversationId: 'conv-1',
    proposerPlayerId: 'player-1',
    action: 'propose_score',
    args: {},
    status: 'pending',
    expiresAt: new Date(),
    schemaVersion: 1,
    result: null,
    createdAt: new Date(),
  }
}

describe('emitCardCreated — senderName', () => {
  it('uses "Ref" when a real groupId is passed (group surface)', () => {
    const emitted: any[] = []
    const bus = { emit: (key: string, event: string, data: any) => emitted.push(data), subscribe: () => () => {} }

    emitCardCreated(bus, 'conv-1', 'group-1', makeCard(), 'Ref drafted a score.')

    expect(emitted[0].senderName).toBe('Ref')
  })

  it('uses "Coach" when groupId is null (1:1 surface)', () => {
    const emitted: any[] = []
    const bus = { emit: (key: string, event: string, data: any) => emitted.push(data), subscribe: () => () => {} }

    emitCardCreated(bus, 'conv-1', null, makeCard(), 'Coach wants to remember: "x".')

    expect(emitted[0].senderName).toBe('Coach')
  })
})
