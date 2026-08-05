module.exports = {
  displayName: 'frontend',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.spec.ts', '<rootDir>/src/**/__tests__/**/*.spec.tsx', '<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.spec.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageReporters: ['text-summary', 'lcov'],
  // Floors: measured actuals, last raised 2026-07-31 (P13 ratings work, babel
  // provider) via scripts/ratchet-coverage.mjs. Raise-only — CLAUDE.md §13. Note
  // these are the global-pool numbers, which exclude every file matched by the two
  // keys below — that pool is why they differ from the "All files" row in the
  // coverage table.
  //
  // The two glob keys are applied by Jest PER MATCHING FILE, not to the group, so
  // these are the worst file in each set. 100 means every file in the set is fully
  // covered today and a new partially-covered file will fail the gate — that is
  // intentional for PWA/service-worker code, which is hard to debug in the field.
  //
  // sw-lib branches is 93 rather than 100: sync-queue.ts has a branch covered
  // non-deterministically (observed 93.75 and 100 across repeat runs of an
  // unchanged tree — CLAUDE.md §13). 93 is the observed minimum; that flakiness is
  // a test defect, not a tuning problem — fix it and this can go back to 100.
  //
  // ⚠ The ratchet script regenerates the whole coverageThreshold block below from
  // Jest's own numbers — any comment placed *inside* it will not survive the next
  // --write. Keep explanations here, above the block, instead.
  coverageThreshold: {
    global: {
      branches: 72,
      functions: 75,
      lines: 85,
      statements: 83,
    },
    './src/workers/sw-lib/**/*.ts': {
      branches: 93,
      functions: 91,
      lines: 100,
      statements: 97,
    },
    './src/pwa/**/*.{ts,tsx}': {
      branches: 88,
      functions: 100,
      lines: 100,
      statements: 97,
    },
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../../shared/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^virtual:pwa-register$': '<rootDir>/src/__tests__/mocks/pwa-register.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        module: 'esnext',
        target: 'esnext',
        lib: ['esnext', 'dom'],
        jsx: 'react-jsx',
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        moduleResolution: 'node',
        baseUrl: '.',
        paths: {
          '@shared/*': ['../../shared/src/*'],
        },
      },
      isolatedModules: true,
    }],
  },
};
