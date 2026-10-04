import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    strictPort: true,
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:3001' },
  },
});
