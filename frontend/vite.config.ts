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
        // Navigation: don't intercept API/photo URLs
        navigateFallbackDenylist: [/^\/api\//, /^\/photos\//],
        // Navigate fallback serves index.html (fetched from network since it's not precached)
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 10 },
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
        // Version start_url + icon URLs with the build hash so the manifest JSON
        // changes every release. Chrome's WebAPK updater keys off the manifest
        // content hash: if the manifest is unchanged it never re-fetches icons,
        // so an old icon snapshot (e.g. the original blue 🐟) sticks forever.
        // The `?v=` query also busts Cloudflare/nginx edge caches per release.
        start_url: `/?v=${BUILD_HASH}`,
        scope: '/',
        icons: [
          // 'any' — used for splash + standard launcher icon
          {
            src: `/icon-192.png?v=${BUILD_HASH}`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `/icon-512.png?v=${BUILD_HASH}`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          // 'maskable' — full-bleed coral so circle/squircle launcher masks
          // don't clip transparent corners or the fish itself.
          {
            src: `/icon-192-maskable.png?v=${BUILD_HASH}`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: `/icon-512-maskable.png?v=${BUILD_HASH}`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          // SVG fallbacks (some browsers, desktop)
          {
            src: '/icon-192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon-512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any',
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
