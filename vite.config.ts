import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  publicDir: resolve(__dirname, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html'),
      },
      output: {
        manualChunks: {
          'vtk': ['@kitware/vtk.js'],
          'cornerstone': [
            '@cornerstonejs/core',
            '@cornerstonejs/tools',
            '@cornerstonejs/dicom-image-loader'
          ],
          'vendor': ['react', 'react-dom', 'react-router-dom', 'zustand']
        }
      }
    },
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 0, // Don't inline workers or WASM
  },
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
  worker: {
    format: 'es',
  },
  define: {
    'process.env': {},
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: [
    '**/*.dcm',      // DICOM files
    '**/*.nii',      // NIfTI files
    '**/*.nii.gz',   // Compressed NIfTI
    '**/*.stl',      // 3D mesh files
    '**/*.vtk',      // VTK files
    '**/*.vtp',      // VTK PolyData
    '**/*.obj',      // OBJ mesh files
    '**/*.gltf',     // glTF 3D models
    '**/*.glb',      // glTF binary
  ],
});
