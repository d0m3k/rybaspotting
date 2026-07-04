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
      // Use virtual module so we can show a reload prompt
      injectRegister: 'auto',
      workbox: {
        // Don't precache index.html — the navigation route handles it
        globPatterns: ['**/*.{js,css,ico,png,svg,jpg,webmanifest}'],
        // Navigation requests that hit these patterns should NOT be served index.html
        navigateFallbackDenylist: [/^\/api\//, /^\/photos\//],
        // Navigation fallback serves index.html for all other routes (SPA)
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 120 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            urlPattern: /^\/photos\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'photo-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
            },
          },
        ],
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
