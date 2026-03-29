import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/hooks/**', 'src/config/**', 'src/app/api/**'],
      exclude: ['src/components/**', 'src/app/(dashboard)/**'],
    },
    setupFiles: ['tests/setup.ts'],
  },
});
