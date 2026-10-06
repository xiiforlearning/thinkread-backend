import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';

// Telegram opens the Mini App over HTTPS at WEBAPP_URL; `base` stays relative so
// the build works from any path (GitHub Pages, Railway static, a sub-folder).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Two pages: the student's Mini App (index.html) and the owner's dashboard (admin.html).
    rollupOptions: { input: { app: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin.html') } },
  },
});
