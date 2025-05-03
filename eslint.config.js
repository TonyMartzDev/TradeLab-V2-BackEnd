// eslint.config.js
export default [
  {
    // Define globals for browser environment
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        console: "readonly",
        localStorage: "readonly",
        FormData: "readonly",
        fetch: "readonly",
        alert: "readonly",
        navigator: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        indexedDB: "readonly",
      },
    },
    // Apply linting rules to all JavaScript files
    files: ["**/*.js"],
    ignores: ["node_modules/**", "dist/**", "coverage-frontend/**"],
    // ESLint rules configuration
    rules: {
      // Error prevention
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "no-debugger": "warn",

      // Style consistency
      semi: ["error", "always"],
      quotes: ["warn", "double"],
      indent: ["warn", 2],
      "comma-dangle": ["warn", "always-multiline"],
      "arrow-parens": ["warn", "always"],

      // Best practices
      eqeqeq: ["error", "always"],
      "no-var": "warn",
      "prefer-const": "warn",
      "no-multiple-empty-lines": ["warn", { max: 2 }],
      "max-len": ["warn", { code: 100, ignoreComments: true }],

      // ES Modules
      "import/no-unresolved": "off", // Browser imports don't need resolution
      "import/extensions": "off", // Allow .js extensions in imports
    },
  },
  {
    // Special rules for test files
    files: ["**/tests/**/*.js", "**/*.test.js", "**/*.spec.js"],
    languageOptions: {
      globals: {
        jest: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "max-len": "off",
    },
  },
];
