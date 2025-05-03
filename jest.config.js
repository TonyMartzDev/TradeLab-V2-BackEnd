// jest.config.js
export default {
  // For backend tests (Node.js environment)
  // If you run backend/frontend tests separately, you might have multiple configs
  // or dynamically set this. For now, 'node' is good for backend focus.
  testEnvironment: "node",

  // Enabling ESM Modules
  transform: {},

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // A list of paths to directories that Jest should use to search for files in
  roots: ["<rootDir>/src", "<rootDir>/__tests__"], // Adjust if your code/tests are elsewhere

  // The glob patterns Jest uses to detect test files (default is usually good)
  // testMatch: [
  //   "**/__tests__/**/*.[jt]s?(x)",
  //   "**/?(*.)+(spec|test).[jt]s?(x)"
  // ],

  // Consider adding setup files if needed later (e.g., for global test setup/teardown)
  // setupFilesAfterEnv: ['./tests/setup.js'],

  // Verbose output can be helpful during development
  verbose: true,
};
