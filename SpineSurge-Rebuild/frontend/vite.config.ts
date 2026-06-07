import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Carries over the COOP/COEP + ES-worker + custom asset config tuned in the old repo so the
// Cornerstone/VTK + WASM pipeline (Step 8) drops in without re-tuning. The `@` alias points at
// `src` to mirror the ported modules' import style.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    // Cross-origin isolation for SharedArrayBuffer (Cornerstone/VTK WASM decoders, Step 8). We use
    // COEP `credentialless` rather than `require-corp` so cross-origin subresources without CORP
    // headers still load — specifically the scan images served from MinIO/S3 and DICOM from the
    // Orthanc/WADO proxy. `credentialless` still yields crossOriginIsolated === true, so the WASM
    // pipeline keeps working, while same-origin workers/WASM in public/ are unaffected.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  worker: {
    format: 'es',
  },
  // Ported from the old repo (Step 8b). dicom-image-loader bundles its own web worker; letting Vite
  // pre-bundle it produces a `.vite/deps` worker URL that COEP (require-corp) blocks, hanging the
  // decode. Excluding it (and pre-including the WASM codecs) keeps the Cornerstone worker pipeline
  // working under the COOP/COEP headers above.
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: [
      'dicom-parser',
      'hammerjs',
      'globalthis',
      '@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs',
      '@cornerstonejs/codec-charls/decodewasmjs',
      '@cornerstonejs/codec-openjpeg/decodewasmjs',
      '@cornerstonejs/codec-openjph/wasmjs',
    ],
  },
  define: {
    'process.env': {},
  },
  build: {
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0, // never inline workers or WASM
    rollupOptions: {
      output: {
        // Split the heavy imaging libs into their own chunks (ported from the old vite config).
        manualChunks: {
          vtk: ['@kitware/vtk.js'],
          cornerstone: [
            '@cornerstonejs/core',
            '@cornerstonejs/tools',
            '@cornerstonejs/dicom-image-loader',
          ],
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
        },
      },
    },
  },
  // 3D model + DICOM asset extensions, carried over for Step 8.
  assetsInclude: [
    '**/*.dcm',
    '**/*.nii',
    '**/*.nii.gz',
    '**/*.stl',
    '**/*.vtk',
    '**/*.vtp',
    '**/*.obj',
    '**/*.gltf',
    '**/*.glb',
  ],
});
