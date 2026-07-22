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
  // Floors: measured actuals 2026-07-22 (babel provider). Raise-only — CLAUDE.md §13.
  // `global` lowered from 80 (it was never enforced — see CLAUDE.md §13); actual was
  // 81.71 stmts / 71.16 branches / 74.52 funcs / 83.4 lines. Note these are the
  // global-pool numbers, which exclude every file matched by the two keys below —
  // that pool is why they differ from the "All files" row in the coverage table.
  //
  // The two glob keys are applied by Jest PER MATCHING FILE, not to the group, so
  // these are the worst file in each set. 100 means every file in the set is fully
  // covered today and a new partially-covered file will fail the gate — that is
  // intentional for PWA/service-worker code, which is hard to debug in the field.
  coverageThreshold: {
    global: {
      branches: 71,
      functions: 74,
      lines: 83,
      statements: 81,
    },
    // branches is 93 rather than the 100 two of three runs report: sync-queue.ts has
    // a branch that is covered non-deterministically (observed 93.75 and 100 across
    // repeat runs of an unchanged tree). 93 is the observed minimum. That flakiness
    // is a test defect, not a tuning problem — fix it and this can go back to 100.
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
