module.exports = {
  // No coverageProvider here on purpose. Like coverageThreshold, it is a global-only
  // option, so it never reached the per-workspace runs that actually enforce the
  // thresholds — those used the default `babel` provider. v8 and babel report
  // different numbers, so declaring v8 only here gave two disagreeing baselines.
  // Everything now uses `babel`; the floors in packages/*/jest.config.js are babel
  // numbers. Changing provider invalidates every floor — re-measure if you do.
  projects: [
    '<rootDir>/packages/core-logic/jest.config.js',
    '<rootDir>/packages/api/jest.config.js',
    '<rootDir>/packages/worker/jest.config.js',
    '<rootDir>/packages/frontend/jest.config.js',
    '<rootDir>/shared/jest.config.js',
  ],
  // text-summary instead of the default `text`: the per-file table is hundreds of
  // lines of noise. lcov is kept so CI/editor tooling still gets a machine-readable
  // artifact. Note: per-package coverageThreshold in packages/*/jest.config.js is
  // NOT enforced by this root config — coverageThreshold is a global-only option
  // and Jest drops it from project configs. Run coverage per-workspace to gate.
  coverageReporters: ['text-summary', 'lcov'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
};
