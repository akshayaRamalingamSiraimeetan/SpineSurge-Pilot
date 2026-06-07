/* Parity/golden test config. `@` resolves to the OLD repo's renderer root so the oracle modules
   (and their internal `@/lib/...` imports) load unchanged. Kept separate from the main app config,
   whose `@` points at the new src/. Run: `npm run test:golden` / regenerate: `npm run golden:gen`. */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../../src/renderer', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['test/golden/**/*.test.ts'],
    root: here,
  },
});
