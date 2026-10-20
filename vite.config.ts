import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
// GitHub Pages serves the app under a subpath (e.g. /pos-manager/), while
// bolt.new and local dev serve from root. We only apply the subpath base when
// the deploy workflow sets VITE_BASE_PATH so the default build keeps working.
const base = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['lucide-react'],
    exclude: ['tesseract.js'],
  },
});
