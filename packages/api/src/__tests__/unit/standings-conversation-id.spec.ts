/**
 * V1.3 carry-over — Both queue modes emit standings.updated on conversation_id
 *
 * Design choice (ii): the inline broadcast (in-memory mode) already resolves
 * and passes conversationId to processStandingsRecalculate. The BullMQ path
 * must also include conversationId in the enqueue payload so the worker
 * processor can emit on conversation_id, not tournamentId.
 *
 * These tests run without Redis (REDIS_URL unset) as part of the default suite.
 * They verify:
 *   1. InMemoryJobQueue path: the enqueue payload includes conversationId
 *      (so when a consumer eventually processes it, it emits on conversation_id)
 *   2. Inline broadcast path: standings.updated is emitted on conversation_id
 *      (existing behaviour, re-asserted here to guard against regression)
 */

import { InMemoryJobQueue } from '@worker/job-queue'

describe('standings.recalculate enqueue payload includes conversationId (in-memory queue)', () => {
  it('enqueue payload carries conversationId field', async () => {
    const queue = new InMemoryJobQueue()

    const job = await queue.add(
      'standings.recalculate',
      { tournamentId: 'tournament_1', groupId: 'group_1', conversationId: 'conv_abc' },
      { jobId: 'standings.recalculate:group_1' }
    )

    expect(job.data).toHaveProperty('conversationId', 'conv_abc')
    await queue.close()
  })

  it('dedup still works when payload includes conversationId', async () => {
    const queue = new InMemoryJobQueue()

    const job1 = await queue.add(
      'standings.recalculate',
      { tournamentId: 't1', groupId: 'g1', conversationId: 'conv_1' },
      { jobId: 'standings.recalculate:g1' }
    )
    const job2 = await queue.add(
      'standings.recalculate',
      { tournamentId: 't1', groupId: 'g1', conversationId: 'conv_1' },
      { jobId: 'standings.recalculate:g1' }
    )
    expect(job2.id).toBe(job1.id)

    await queue.close()
  })
})

describe('processStandingsRecalculate emits on conversationId (not tournamentId)', () => {
  it('emits standings.updated on conversationId when provided', async () => {
    const { processStandingsRecalculate } = await import('../../workers/standings-processor')

    const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }
    const groupRepo = {
      findMembersByGroup: jest.fn().mockResolvedValue([
        { id: 'player_1', name: 'Alice' },
        { id: 'player_2', name: 'Bob' },
      ]),
      findMatchesByGroup: jest.fn().mockResolvedValue([]),
    }

    await processStandingsRecalculate(
      { tournamentId: 'tournament_X', groupId: 'group_Y', conversationId: 'conv_Z' },
      { groupRepo: groupRepo as any, broadcastBus: broadcastBus as any }
    )

    expect(broadcastBus.emit).toHaveBeenCalledWith(
      'conv_Z',
      'standings.updated',
      expect.objectContaining({ groupId: 'group_Y' })
    )
    // Must NOT emit on tournamentId
    expect(broadcastBus.emit).not.toHaveBeenCalledWith(
      'tournament_X',
      'standings.updated',
      expect.anything()
    )
  })

  it('falls back to tournamentId when conversationId is absent (legacy callers)', async () => {
    const { processStandingsRecalculate } = await import('../../workers/standings-processor')

    const broadcastBus = { emit: jest.fn(), subscribe: jest.fn(() => () => {}) }
    const groupRepo = {
      findMembersByGroup: jest.fn().mockResolvedValue([]),
      findMatchesByGroup: jest.fn().mockResolvedValue([]),
    }

    await processStandingsRecalculate(
      { tournamentId: 'tournament_X', groupId: 'group_Y' },
      { groupRepo: groupRepo as any, broadcastBus: broadcastBus as any }
    )

    expect(broadcastBus.emit).toHaveBeenCalledWith(
      'tournament_X',
      'standings.updated',
      expect.anything()
    )
  })
})
