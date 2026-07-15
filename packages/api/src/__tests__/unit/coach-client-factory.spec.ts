/**
 * Coverage — selectCoachClient factory (mirrors assistant-client-factory.spec.ts).
 */
const mockLog = { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() }
jest.mock('../../logger', () => ({ getLogger: jest.fn(() => mockLog) }))

import { selectCoachClient } from '../../assistant/coach-client-factory'
import { MockCoachClient, AnthropicCoachClient } from '../../assistant/coach-client'
import { DEFAULT_APP_CONFIG, type AppConfig } from '../../config'

function config(overrides: Partial<AppConfig['assistant']>): AppConfig {
  return { ...DEFAULT_APP_CONFIG, assistant: { ...DEFAULT_APP_CONFIG.assistant, ...overrides } }
}

describe('selectCoachClient', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns MockCoachClient for adapter "mock" (the default)', () => {
    const client = selectCoachClient(config({ adapter: 'mock' }))
    expect(client).toBeInstanceOf(MockCoachClient)
  })

  it('returns AnthropicCoachClient for adapter "anthropic", using coachModel', () => {
    const prevKey = process.env.ANTHROPIC_API_KEY
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'
    try {
      const client = selectCoachClient(config({ adapter: 'anthropic', coachModel: 'claude-haiku-4-5' }))
      expect(client).toBeInstanceOf(AnthropicCoachClient)
    } finally {
      if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = prevKey
    }
  })

})
