/// <reference types="vitest/config" />
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Configuration de Vite (l'outil qui lance l'appli en développement et la "construit" pour la mise en ligne).
// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Sur GitHub Pages, l'appli vit dans un sous-dossier (ex. /trieur-cd/) : on le reçoit via BASE_PATH.
  base: process.env.BASE_PATH ?? '/',

  plugins: [
    vue(),

    // Mode « phone » (npm run dev:phone) : HTTPS avec un certificat auto-signé,
    // indispensable pour que le téléphone accepte d'ouvrir la caméra.
    ...(mode === 'phone' ? [basicSsl()] : []),

    // Transforme le site en application installable qui fonctionne hors ligne.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Mediamwa',
        short_name: 'Mediamwa',
        description: 'Scanner, identifier et ranger ses CD, livres, BD, films et jeux vidéo.',
        lang: 'fr',
        theme_color: '#1d2740',
        background_color: '#f5f2ea',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tout le code de l'appli (y compris le moteur de scan .wasm) est gardé pour le mode hors ligne.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // Les pochettes sont mises de côté au fur et à mesure pour rester visibles hors ligne.
            urlPattern: ({ url }) =>
              url.hostname === 'coverartarchive.org' ||
              url.hostname.endsWith('.archive.org') ||
              url.hostname === 'i.discogs.com' ||
              // Couvertures de livres (v2)
              url.hostname === 'covers.openlibrary.org' ||
              (url.hostname === 'catalogue.bnf.fr' && url.pathname === '/couverture'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pochettes',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  test: {
    environment: 'node',
  },
}))
