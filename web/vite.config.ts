import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset and data URLs relative so the static build works on
// GitHub Pages sub-paths and inside an iframe.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
});
