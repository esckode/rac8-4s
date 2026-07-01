/**
 * Regression tests for LOG_LEVEL filtering semantics.
 *
 * logger.ts's `baseline` is captured at module load time from LOG_LEVEL, so
 * each case here does jest.resetModules() + a fresh dynamic import with
 * LOG_LEVEL set beforehand, to get an isolated module instance per baseline.
 *
 * Raising the baseline should hide *quieter* levels (below the baseline) and
 * always allow *louder* levels (at or above the baseline) through.
 */

import type { LogEntry } from '../../logger'

const originalLogLevel = process.env.LOG_LEVEL

afterEach(() => {
  if (originalLogLevel === undefined) {
    delete process.env.LOG_LEVEL
  } else {
    process.env.LOG_LEVEL = originalLogLevel
  }
})

async function loggedLevelsAt(baseline: string): Promise<string[]> {
  jest.resetModules()
  process.env.LOG_LEVEL = baseline
  const { getLogger, addTransport } = await import('../../logger')

  const entries: LogEntry[] = []
  addTransport((entry) => entries.push(entry))

  const log = getLogger('level-filter-test')
  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  return entries.map((e) => e.level)
}

describe('LOG_LEVEL filtering semantics', () => {
  it('LOG_LEVEL=debug lets all levels through (debug, info, warn, error)', async () => {
    expect(await loggedLevelsAt('debug')).toEqual(['debug', 'info', 'warn', 'error'])
  })

  it('LOG_LEVEL=info hides debug but lets info/warn/error through', async () => {
    expect(await loggedLevelsAt('info')).toEqual(['info', 'warn', 'error'])
  })

  it('LOG_LEVEL=warn hides debug/info but lets warn/error through', async () => {
    expect(await loggedLevelsAt('warn')).toEqual(['warn', 'error'])
  })

  it('LOG_LEVEL=error only lets error through', async () => {
    expect(await loggedLevelsAt('error')).toEqual(['error'])
  })
})
