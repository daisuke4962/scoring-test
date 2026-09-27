import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two entry pages: /trainee/ (phones) and /instructor/ (the PC).
// In dev, API and WebSocket calls are proxied to the Node server on 8787.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        root: resolve(__dirname, 'index.html'),
        trainee: resolve(__dirname, 'trainee/index.html'),
        instructor: resolve(__dirname, 'instructor/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/videos': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
