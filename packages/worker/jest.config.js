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
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core-logic/src/$1',
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
  },
};
