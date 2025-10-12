import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // Error prevention
      "no-console": "warn",
      "no-debugger": "error",
      "no-unused-vars": "error",
      "no-undef": "error",

      // Code quality
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      "template-curly-spacing": "error",

      // ES6+ features
      "arrow-spacing": "error",
      "generator-star-spacing": "error",
      "no-duplicate-imports": "error",

      // Function definitions
      "func-call-spacing": "error",
      "no-implied-eval": "error",
      "new-cap": "error",
      "new-parens": "error",

      // Spacing and formatting
      "array-bracket-spacing": "error",
      "block-spacing": "error",
      "brace-style": ["error", "1tbs", { "allowSingleLine": true }],
      "camelcase": ["error", { "properties": "never" }],
      "comma-dangle": ["error", "never"],
      "comma-spacing": "error",
      "comma-style": "error",
      "computed-property-spacing": "error",
      "consistent-this": ["error", "self"],
      "eol-last": "error",
      "indent": ["error", 2, { "SwitchCase": 1 }],
      "key-spacing": "error",
      "keyword-spacing": "error",
      "line-comment-position": "error",
      "lines-around-comment": "error",
      "max-depth": ["error", 4],
      "max-len": ["error", { "code": 100, "ignoreUrls": true }],
      "max-nested-callbacks": ["error", 3],
      "max-params": ["error", 5],
      "new-parens": "error",
      "newline-per-chained-call": "error",
      "no-array-constructor": "error",
      "no-bitwise": "warn",
      "no-continue": "warn",
      "no-inline-comments": "off",
      "no-lonely-if": "error",
      "no-mixed-spaces-and-tabs": "error",
      "no-multiple-empty-lines": ["error", { "max": 2, "maxBOF": 0, "maxEOF": 1 }],
      "no-negated-condition": "warn",
      "no-nested-ternary": "error",
      "no-new-object": "error",
      "no-plusplus": "off",
      "no-restricted-syntax": "off",
      "no-tabs": "error",
      "no-ternary": "off",
      "no-trailing-spaces": "error",
      "no-underscore-dangle": "off",
      "no-unneeded-ternary": "error",
      "object-curly-spacing": ["error", "always"],
      "one-var": ["error", "never"],
      "one-var-declaration-per-line": "error",
      "operator-assignment": "error",
      "operator-linebreak": "error",
      "padded-blocks": ["error", "never"],
      "quote-props": ["error", "as-needed"],
      "quotes": ["error", "single", { "avoidEscape": true, "allowTemplateLiterals": true }],
      "semi": "error",
      "semi-spacing": "error",
      "space-before-blocks": "error",
      "space-before-function-paren": ["error", {
        "anonymous": "always",
        "named": "never",
        "asyncArrow": "always"
      }],
      "space-in-parens": "error",
      "space-infix-ops": "error",
      "space-unary-ops": "error",
      "spaced-comment": "error",

      // Error handling
      "no-throw-literal": "error",
      "prefer-promise-reject-errors": "error",

      // Async/await
      "require-await": "error",
      "no-return-await": "error",

      // Best practices
      "eqeqeq": ["error", "always"],
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-self-compare": "error",
      "no-sequences": "error",
      "no-void": "error",
      "no-with": "error",
      "radix": "error",
      "wrap-iife": "error",
      "yoda": "error",

      // WASM-specific rules
      "no-empty": ["error", { "allowEmptyCatch": true }],
    },
  },
  {
    // Configuration for test files
    files: ["tests/**/*.js", "**/*.test.js", "**/*.spec.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        test: true,
        expect: true,
        describe: true,
        it: true,
        before: true,
        after: true,
        beforeEach: true,
        afterEach: true,
      },
    },
    rules: {
      "no-console": "off",
      "max-len": "off",
    },
  },
  {
    // Configuration for build and config files
    files: ["*.config.js", "rollup.config.js", "vite.config.js"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-console": "off",
    },
  },
];