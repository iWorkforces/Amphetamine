import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        '**/__mocks__/**',
        '**/*.d.ts',
        'src/assets.d.ts',
        // Type-only ports / pure re-export barrels (no runtime statements of value).
        '**/*.port.ts',
        '**/application/**/index.ts',
        '**/domain/index.ts',
        '**/infrastructure/benchmark/index.ts',
        '**/domain/settings/sleep-block-mode.ts',
        // Electron integration harness; pure metrics tested separately.
        '**/infrastructure/benchmark/benchmark.ts',
        // Pure re-export barrels.
        '**/main/platform/index.ts',
        '**/shared/settings-validators.ts',
        // Process/entry + electron-updater + large UI surfaces covered by suite
        // behaviorally but not fully branchable under unit mocks without brittle
        // full-process harnesses. Pure helpers and adapters stay included.
        '**/main/index.ts',
        '**/main/auto-updater.ts',
        '**/infrastructure/updater/hybrid-auto-updater.ts',
        '**/main/tray.ts',
        '**/main/about-window.ts',
        '**/main/settings-window.ts',
        '**/renderer/settings/index.ts',
        '**/renderer/benchmark-countdown.ts',
        '**/renderer/index.ts',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
      },
    },
    pool: 'threads',
    projects: [
      {
        test: {
          name: 'domain',
          environment: 'node',
          include: ['tests/domain/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/domain/**/*.ts'],
            exclude: ['src/domain/**/*.d.ts'],
          },
        },
      },
      {
        test: {
          name: 'application',
          environment: 'node',
          include: ['tests/application/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/application/**/*.ts'],
            exclude: ['src/application/**/*.d.ts'],
          },
        },
      },
      {
        test: {
          name: 'main',
          environment: 'node',
          include: [
            'tests/main/**/*.test.ts',
            'tests/infrastructure/**/*.test.ts',
            'tests/shared/**/*.test.ts',
          ],
          setupFiles: ['./tests/setup.main.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/main/**/*.ts', 'src/infrastructure/**/*.ts', 'src/shared/**/*.ts'],
            exclude: [
              'src/main/**/*.d.ts',
              'src/infrastructure/**/*.d.ts',
              'src/shared/**/*.d.ts',
            ],
          },
        },
      },
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/renderer/**/*.ts'],
            exclude: ['src/renderer/**/*.d.ts'],
          },
        },
      },
    ],
  },
});
