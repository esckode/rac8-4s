module.exports = {
  displayName: 'shared',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.spec.ts', '<rootDir>/src/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  // This package is type declarations only and has no tests — testMatch resolves to
  // 0 files. Without this, `npm run test:coverage` (which delegates to every
  // workspace) fails here on "No tests found" rather than on any real problem.
  passWithNoTests: true,
  // Retained but currently vacuous: with no tests there is nothing to measure, so
  // this gates nothing. If runtime code ever lands in this package, replace these
  // with measured actuals per CLAUDE.md §13.
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
