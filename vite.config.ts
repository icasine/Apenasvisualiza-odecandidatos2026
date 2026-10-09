import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

// Os dados eleitorais ficam no GitHub e são lidos de lá (direto ou pelo serviço de acesso).
// Esta etapa tira a pasta de dados do site publicado, para que ninguém baixe os arquivos
// pelo endereço do app sem passar pelo login.
const removerDadosDoSite = () => {
  try {
    fs.rmSync(path.resolve(__dirname, 'dist/data'), { recursive: true, force: true });
  } catch {}
};
const semDadosEmbutidos = () => ({
  name: 'sem-dados-embutidos',
  apply: 'build' as const,
  writeBundle() {
    removerDadosDoSite();
  },
  closeBundle() {
    removerDadosDoSite();
  }
});

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      semDadosEmbutidos(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Mapa Eleitoral Contagem',
          short_name: 'MapaContagem',
          description: 'Resultados e seções eleitorais de Contagem/MG em mapa interativo',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,json}'],
          globIgnores: ['**/data/**'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
