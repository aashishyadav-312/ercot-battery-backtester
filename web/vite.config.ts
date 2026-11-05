import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /ercot-battery-backtester/. Routing is
// hash-based (see src/state.tsx), so no server-side rewrites are needed, and the
// data loader prefixes import.meta.env.BASE_URL.
//
// The live Worker (worker/) only allows the GitHub Pages origin, so local dev
// and preview reach it through this proxy (see src/live/live.ts).
const liveProxy = {
  '/live-api': {
    target: 'https://ercot-live.aashishyadav312.workers.dev',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/live-api/, ''),
  },
};

export default defineConfig({
  base: '/ercot-battery-backtester/',
  server: { proxy: liveProxy },
  preview: { proxy: liveProxy },
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
  // Unit tests run with V4 off unless VITE_V4 is set in the shell (CI runs them both ways); a test that needs V4 mocks the flag.
  test: { env: { VITE_V4: process.env.VITE_V4 ?? '0' } },
});
