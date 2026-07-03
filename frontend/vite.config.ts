import { execSync } from 'child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Build hash: GITHUB_SHA in CI, git rev-parse locally
const BUILD_HASH = (process.env.GITHUB_SHA?.slice(0, 7))
  || execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  || 'dev';

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(BUILD_HASH),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
      },
      manifest: {
        name: 'Ryby z Dupom — Spotter',
        short_name: 'RybySpotter',
        description: 'Spot and collect Ryby z Dupom graffiti around Kraków',
        theme_color: '#FF6B6B',
        background_color: '#FFF8F0',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/photos': 'http://127.0.0.1:8080',
    },
  },
});
