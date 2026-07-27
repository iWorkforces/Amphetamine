import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["lib/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: [
      "src/main/**/*.ts",
      "src/infrastructure/**/*.ts",
      "src/application/**/*.ts",
      "src/domain/**/*.ts",
      "tests/main/**/*.ts",
      "tests/application/**/*.ts",
      "tests/domain/**/*.ts",
      "tests/setup.main.ts",
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
      globals: {
        // Node.js globals
        process: "readonly",
        Buffer: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
        URL: "readonly",
        // Vitest globals
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly",
        performance: "readonly",
        // Electron type namespaces
        Electron: "readonly",
      },
    },
  },
  {
    files: ["src/preload/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
      globals: {
        // Node.js + browser globals (preload bridges both)
        process: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        window: "readonly",
        document: "readonly",
      },
    },
  },
  {
    files: ["src/renderer/**/*.ts", "tests/renderer/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
      },
      globals: {
        // Browser globals
        window: "readonly",
        document: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLButtonElement: "readonly",
        HTMLSpanElement: "readonly",
        EventListener: "readonly",
        Event: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        performance: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        URL: "readonly",
        console: "readonly",
        // Vitest globals
        vi: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        test: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: "./tsconfig.tests.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },

    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // NOTE: template-literal innerHTML is used intentionally in renderer/index.ts and settings/index.ts
      // for app-controlled state (not user input). XSS risk is low but consider textContent for new code.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",

      // Code style (match existing conventions)
      "no-console": "off", // electron-log handles production; console ok in dev
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "no-throw-literal": "error",

      // Security (Electron)
      "no-eval": "error",
      "no-new-func": "error",

      // --- STICKY type-safety (do not downgrade for src/; CI asserts via typecheck:sticky) ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/strict-boolean-expressions": ["error", {
        allowNullableBoolean: true,
        allowNullableString: true,
        allowNullableNumber: false,
        allowAny: false,
      }],
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": true,
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
        },
      ],
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // Domain and application must stay free of Electron and process-root imports.
    files: ["src/domain/**/*.ts", "src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "domain/application must not import electron",
            },
            {
              name: "electron-log",
              message: "domain/application must not import electron-log",
            },
            {
              name: "electron-updater",
              message: "domain/application must not import electron-updater",
            },
          ],
          patterns: [
            {
              group: ["**/main/**", "**/infrastructure/**", "**/preload/**", "**/renderer/**"],
              message: "domain/application must not import process-root or infrastructure modules",
            },
          ],
        },
      ],
    },
  },
  {
    // Domain must not depend on application (stricter than application rules).
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "domain must not import electron",
            },
            {
              name: "electron-log",
              message: "domain must not import electron-log",
            },
            {
              name: "electron-updater",
              message: "domain must not import electron-updater",
            },
          ],
          patterns: [
            {
              group: [
                "**/main/**",
                "**/application/**",
                "**/infrastructure/**",
                "**/preload/**",
                "**/renderer/**",
              ],
              message: "domain must not import outer layers",
            },
          ],
        },
      ],
    },
  },
  {
    // Tests use vi.hoisted/vi.fn which return `any`-typed mocks by design.
    // Disable unsafe-* in tests to avoid false positives on mock surfaces.
    // Non-null assertions and occasional @ts-expect-error are common in fixtures;
    // sticky bans still apply to src/ only.
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-check": false,
          minimumDescriptionLength: 3,
        },
      ],
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  prettier, // Prettier must be last to override formatting rules
];
