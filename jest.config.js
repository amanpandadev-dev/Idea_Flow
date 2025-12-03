export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: [
    '**/backend/tests/**/*.test.js',
    '**/backend/tests/**/*.pbt.js'
  ],
  testTimeout: 30000,
  verbose: true
};
