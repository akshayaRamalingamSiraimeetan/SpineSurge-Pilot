import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    '@tailwindcss/postcss': {
      // Restrict Tailwind's source scanner to src/renderer only.
      // Without this, Tailwind v4 scans the entire project root (process.cwd())
      // using the pattern "**/*", which hits binary .wasm files in public/
      // and binary-encoded JS files (charlswasm_decode.js, etc.), causing
      // PostCSS to throw "Invalid code point" errors.
      base: resolve(__dirname, 'src/renderer'),
    },
    autoprefixer: {},
  },
};
