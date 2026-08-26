import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import compat from "eslint-plugin-compat";
import globals from "globals";

const shippedSourceFiles = [
  "index.js",
  "apibinding/**/*.js",
  "model/**/*.js",
  "io/**/*.js",
  "formats/**/*.js",
  "internal/**/*.js",
];

const qualityRules = {
  "no-var": "error",
  "prefer-const": "error",
  curly: ["error", "all"],
  "no-unused-vars": [
    "error",
    {
      vars: "all",
      args: "none",
      caughtErrors: "all",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "no-console": ["warn", { allow: ["warn", "error"] }],
  semi: ["error", "always"],
  "no-undef": "error",
  "no-prototype-builtins": "error",
  "no-empty": ["error", { allowEmptyCatch: false }],
  "no-control-regex": "error",
  "no-redeclare": "error",
  eqeqeq: ["error", "always"],
  "no-bitwise": "error",
  "guard-for-in": "error",
  "no-caller": "error",
  "no-new": "error",
  "no-use-before-define": ["error", { functions: false }],
};

export default [
  {
    ignores: [
      "coverage/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "docs/conformance/generated/**",
      "docs/conformance/upstream/**",
      "docs/provenance/history-reconstruction/**",
      "util/owlapi-reference/fixtures/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: qualityRules,
  },
  {
    ...compat.configs["flat/recommended"],
    files: shippedSourceFiles,
    ignores: ["**/*.test.js", "**/*.test.mjs"],
    settings: {
      ...compat.configs["flat/recommended"].settings,
      lintAllEsApis: true,
    },
  },
  prettier,
];
