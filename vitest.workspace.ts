import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/__mocks__/**', '**/*.d.ts', 'src/assets.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
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
          include: ['tests/main/**/*.test.ts'],
          setupFiles: ['./tests/setup.main.ts'],
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json-summary'],
            include: ['src/main/**/*.ts', 'src/infrastructure/**/*.ts'],
            exclude: ['src/main/**/*.d.ts', 'src/infrastructure/**/*.d.ts'],
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
