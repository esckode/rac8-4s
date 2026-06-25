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
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core-logic/src/$1',
    '^@worker/(.*)$': '<rootDir>/../worker/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
  },
};
