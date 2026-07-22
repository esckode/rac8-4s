module.exports = {
  displayName: 'worker',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.spec.ts', '<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    // Redis-required implementations: tested by Redis-gated specs (skip when REDIS_URL unset)
    '!src/bullmq-queue.ts',
    '!src/worker.ts',
    '!src/partition-scheduler.ts',
    '!src/index.ts',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  // Floors: measured actuals 2026-07-22 (babel provider). Raise-only — CLAUDE.md §13.
  // Raised from 90; actual was 98.24 stmts / 94.73 branches / 100 funcs / 100 lines.
  // Measured with REDIS_URL unset, i.e. with the Redis-gated specs above skipped.
  coverageThreshold: {
    global: {
      branches: 94,
      functions: 100,
      lines: 100,
      statements: 98,
    },
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core-logic/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
  },
};
