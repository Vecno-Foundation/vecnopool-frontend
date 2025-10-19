import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'esbuild', // Ensure minification
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split large dependencies into separate chunks
          vendor: ['react', 'react-dom', 'chart.js', 'lodash'],
        },
      },
    },
  },
  server: {
    host: 'localhost',
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://poolapi.vecnoscan.org',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  root: '.',
  publicDir: 'public',
});