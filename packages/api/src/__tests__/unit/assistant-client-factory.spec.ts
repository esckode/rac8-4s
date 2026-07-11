/**
 * A8.2 coverage — selectAssistantClient factory (mirrors selectJobQueue).
 */
const mockLog = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() }
jest.mock('../../logger', () => ({ getLogger: jest.fn(() => mockLog) }))

import { selectAssistantClient } from '../../assistant/assistant-client-factory'
import { MockAssistantClient, AnthropicAssistantClient } from '../../assistant/assistant-client'
import { DEFAULT_APP_CONFIG, type AppConfig } from '../../config'

function config(overrides: Partial<AppConfig['assistant']>): AppConfig {
  return { ...DEFAULT_APP_CONFIG, assistant: { ...DEFAULT_APP_CONFIG.assistant, ...overrides } }
}

describe('selectAssistantClient', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns MockAssistantClient for adapter "mock" (the default)', () => {
    const client = selectAssistantClient(config({ adapter: 'mock' }))
    expect(client).toBeInstanceOf(MockAssistantClient)
  })

  it('returns AnthropicAssistantClient for adapter "anthropic" (first-party fallback)', () => {
    const prevKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'
    try {
      const client = selectAssistantClient(config({ adapter: 'anthropic', model: 'claude-haiku-4-5' }))
      expect(client).toBeInstanceOf(AnthropicAssistantClient)
    } finally {
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prevKey
    }
  })
})
