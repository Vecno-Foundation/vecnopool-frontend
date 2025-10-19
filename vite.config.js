import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3333,
    proxy: {
      '/api': {
        target: 'https://poolapi.vecnoscan.org/',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://poolapi.vecnoscan.org/',
        ws: true,
      },
    },
  },
  root: '.',
  publicDir: 'public', 
});