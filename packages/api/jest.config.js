module.exports = {
  displayName: 'api',
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Per-test timeout is set via jest.setTimeout(30000) in src/__tests__/setup.ts,
  // because testTimeout is a global option Jest rejects in a per-project config.
  // Test isolation: getTestPool() (src/__tests__/helpers/db.ts) returns a transactional
  // proxy that routes all queries through one per-suite connection, translates BEGIN/COMMIT
  // to savepoints, and rolls back in afterAll — so tests never commit to the shared DB.
  // Workers run in separate processes, each with its own connection.
  maxWorkers: 4,
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/__tests__/unit/**/*.spec.ts',
    '<rootDir>/src/__tests__/integration/**/*.spec.ts',
    '<rootDir>/src/__tests__/e2e/**/*.spec.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/index.ts',
    '!src/auth/index.ts',
    '!src/server.ts',
    '!src/worker-entrypoint.ts',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  // Floors: measured actuals 2026-07-22, green run (babel provider). Raise-only —
  // CLAUDE.md §13. Actual was 87.45 stmts / 76.06 branches / 88.61 funcs / 87.87 lines.
  //
  // branches is LOWERED from 85, which had never been enforced (coverageThreshold is
  // a Jest global-only option and was dropped by the root projects: config). Real
  // branch coverage has been ~76 the whole time; 85 was aspirational. Raising it back
  // means writing tests, not editing this number.
  //
  // Caveat: src/__tests__/unit/assistant-anthropic-client.spec.ts is FLAKY — repeat
  // runs of an unchanged tree gave 11 failures once and 2502-passed the next. These
  // floors are safe despite that (branches measured 75.81 red vs 76.06 green, so the
  // flaky tests barely move coverage), but the flakiness is a real defect to fix.
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 87,
      lines: 86,
      statements: 86,
    },
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core-logic/src/$1',
    '^@worker/(.*)$': '<rootDir>/../worker/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
  },
};
