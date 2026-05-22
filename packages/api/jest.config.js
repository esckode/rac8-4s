module.exports = {
  displayName: 'api',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  // Transactional isolation strategy: each test suite runs in its own transaction.
  // All queries within a suite use the same transaction client (database-level isolation).
  // Transactions are rolled back after the suite, avoiding deadlocks and cleanup issues.
  // With maxWorkers: 4+, suites run in parallel safely because transactions don't conflict.
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
