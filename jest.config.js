module.exports = {
  projects: [
    '<rootDir>/packages/core-logic/jest.config.js',
    '<rootDir>/packages/api/jest.config.js',
    '<rootDir>/packages/worker/jest.config.js',
    '<rootDir>/packages/frontend/jest.config.js',
    '<rootDir>/shared/jest.config.js',
  ],
  collectCoverageFrom: [
    'packages/**/src/**/*.{ts,tsx}',
    'shared/src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
};
