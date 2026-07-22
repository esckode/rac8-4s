module.exports = {
  displayName: 'core-logic',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.spec.ts', '<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  // Floors: measured actuals 2026-07-22 (babel provider). Raise-only — CLAUDE.md §13.
  // Lowered from a declared 100 that had never been enforced: coverageThreshold is a
  // Jest global-only option, so it was silently dropped by the root projects: config.
  // Actual was 94.06 stmts / 85.86 branches / 93.75 funcs / 95 lines.
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 93,
      lines: 95,
      statements: 94,
    },
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
  },
};
