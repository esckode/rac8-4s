/**
 * AssistantClient selection — mirrors selectJobQueue / EMAIL_SERVICE.
 *
 * ASSISTANT_ADAPTER=mock (default) | anthropic-aws (primary, Q17) | anthropic
 * (first-party fallback). Adapter unset/mock = bot answers deterministically,
 * no network — the prod channel stays inert until deployment config enables
 * it (A9.2: not before the privacy-policy clause ships).
 */
import type { AppConfig } from '../config'
import { AssistantClient, AnthropicAssistantClient, MockAssistantClient } from './assistant-client'
import { getLogger } from '../logger'

const log = getLogger('assistant-client-factory')

export function selectAssistantClient(config: AppConfig): AssistantClient {
  const { adapter, model } = config.assistant

  if (adapter === 'anthropic-aws' || adapter === 'anthropic') {
    log.info('assistant.client.selected', { adapter, model })
    return new AnthropicAssistantClient({ adapter, model })
  }

  log.info('assistant.client.selected', { adapter: 'mock', model })
  return new MockAssistantClient()
}
