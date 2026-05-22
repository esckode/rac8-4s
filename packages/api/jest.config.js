module.exports = {
  displayName: 'api',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  // TRUNCATE-once isolation strategy allows parallel execution.
  // Tests create unique data via factories (UUID), so no row-level conflicts.
  // Each test suite truncates once in beforeAll, not per-test.
  // Parallelism is safe because: unique data + serialized TRUNCATE = no deadlocks.
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
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core-logic/src/$1',
    '^@worker/(.*)$': '<rootDir>/../worker/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
  },
};
