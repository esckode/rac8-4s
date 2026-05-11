module.exports = {
  coverageProvider: 'v8',
  projects: [
    '<rootDir>/packages/core-logic/jest.config.js',
    '<rootDir>/packages/api/jest.config.js',
    '<rootDir>/packages/worker/jest.config.js',
    '<rootDir>/packages/frontend/jest.config.js',
    '<rootDir>/shared/jest.config.js',
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
