import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `public/` holds ported worker/WASM decoder assets (incl. their .d.ts) — runtime blobs, not source.
  { ignores: ['dist', 'node_modules', 'public'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Ported-verbatim 2D engine + clinical calculators (Step 7b). These modules are copied unchanged
  // from the old repo to preserve validated behavior; their internal `any` usage is intentionally
  // left as-is here and is tightened under Step 7c (`applyOperation` discriminated union, MASTER §8.4).
  // The parity tests are the behavioral guardrail; lint is relaxed only for `any` on this subtree.
  {
    files: [
      'src/lib/canvas/**/*.ts',
      'src/features/measurements/quick/**/*.ts',
      'src/features/measurements/deformity/**/*.ts',
      'src/features/measurements/pathology/**/*.ts',
      // Step 8 ports: planning (PedicleLogic volume probe `any`, `let diameter`) and the
      // DICOM volume helpers (volumeEraser `cache` `any`). SurgicalGeometry/ScrewDefaults/maskUtils
      // are clean but live in these trees; the parity tests remain the behavioral guardrail.
      'src/features/measurements/planning/**/*.ts',
      'src/features/dicom/**/*.ts',
      // Cornerstone3D/VTK init + viewer pipeline (8b): heavy ESM/CJS interop `any` casts, ported as-is.
      'src/lib/cornerstone/**/*.{ts,tsx}',
    ],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Ported verbatim: a few branches declare `let` that a sibling branch reassigns but some
      // arms don't — left as the original wrote it rather than re-styling validated math.
      'prefer-const': 'off',
    },
  },
);
