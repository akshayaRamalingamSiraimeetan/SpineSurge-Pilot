/* Main app test config (`@` → new src/). Component/unit tests live under src/. The golden/parity
   suite has its own config (vitest.golden.config.ts) because its `@` points at the old repo. */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'test/golden/**'],
    passWithNoTests: true,
  },
});
