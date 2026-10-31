import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /ercot-battery-backtester/. Routing is
// hash-based (see src/state.tsx), so no server-side rewrites are needed, and the
// data loader prefixes import.meta.env.BASE_URL.
export default defineConfig({
  base: '/ercot-battery-backtester/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
});
