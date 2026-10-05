import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Telegram opens the Mini App over HTTPS at WEBAPP_URL; `base` stays relative so
// the build works from any path (GitHub Pages, Railway static, a sub-folder).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, host: true },
  build: { target: 'es2022', sourcemap: false },
});
