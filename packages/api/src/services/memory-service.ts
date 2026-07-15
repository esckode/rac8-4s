/**
 * Memory service — 1:1 Coach remember-card confirm authority (design §5.2).
 *
 * Mutate-first (mirrors submitScore/createPoll/castVote): insert the
 * player_memories row through the real repository, THEN atomically flip the
 * card pending→confirmed. The ~20-entry cap is revalidated here — confirm is
 * the authority, not the draft-time check in propose_remember, since time
 * passes between draft and confirm.
 */
import { AssistantCardRepository } from '../repositories/assistant-card-repository'
import { PlayerMemoryRepository } from '../repositories/player-memory-repository'
import { COACH_MEMORY_CAP } from '../assistant/coach-constants'
import { getLogger } from '../logger'

const log = getLogger('memory-service')

export interface ConfirmRememberDeps {
  cardRepo: AssistantCardRepository
  memoryRepo: PlayerMemoryRepository
}

export interface ConfirmRememberInput {
  cardId: string
  playerId: string
  text: string
}

export type ConfirmRememberResult =
  | { ok: true; status: 'confirmed'; memoryId: string }
  | { ok: true; status: 'failed'; reason: string }
  | { ok: false }

/** Returns ok:false only on a lost claim race (card no longer pending) — never on validation failure. */
export async function confirmRemember(
  deps: ConfirmRememberDeps,
  input: ConfirmRememberInput
): Promise<ConfirmRememberResult> {
  const { cardId, playerId, text } = input
  const { cardRepo, memoryRepo } = deps

  const count = await memoryRepo.countMemories(playerId)
  if (count >= COACH_MEMORY_CAP) {
    const reason = 'memory cap reached since this was drafted'
    const claimed = await cardRepo.claimCard(cardId, 'failed', { reason })
    if (!claimed) return { ok: false }
    log.info('coach.memory.failed', { playerId, cardId, reason })
    return { ok: true, status: 'failed', reason }
  }

  const memory = await memoryRepo.insertMemory({ playerId, body: text, source: 'player' })
  const claimed = await cardRepo.claimCard(cardId, 'confirmed', { memoryId: memory.id })
  if (!claimed) return { ok: false }

  log.info('coach.memory.confirmed', { playerId, cardId, memoryId: memory.id })
  return { ok: true, status: 'confirmed', memoryId: memory.id }
}
