/**
 * CoachClient selection — mirrors assistant-client-factory.ts, keyed on the
 * same ASSISTANT_ADAPTER env var (one kill-switch, design §7 #2), but reads
 * config.assistant.coachModel instead of .model.
 */
import type { AppConfig } from '../config'
import { CoachClient, AnthropicCoachClient, MockCoachClient } from './coach-client'
import { getLogger } from '../logger'

const log = getLogger('coach-client-factory')

export function selectCoachClient(config: AppConfig): CoachClient {
  const { adapter, coachModel } = config.assistant

  if (adapter === 'anthropic-aws' || adapter === 'anthropic') {
    log.info('coach.client.selected', { adapter, model: coachModel })
    return new AnthropicCoachClient({ adapter, model: coachModel })
  }

  log.info('coach.client.selected', { adapter: 'mock', model: coachModel })
  return new MockCoachClient()
}
