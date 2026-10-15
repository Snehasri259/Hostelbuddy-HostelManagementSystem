import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API is proxied so the browser sees ONE origin (cookies just work, no CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_DEV_API || 'http://localhost:5000', changeOrigin: false } },
  },
  preview: { port: 4173 },
  build: { outDir: 'dist', sourcemap: false, target: 'es2020' },
});
