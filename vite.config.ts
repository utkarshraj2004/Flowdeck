import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: true },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:8080', ws: true },
    },
  },
});
