import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/Robot_Arm_Configurator/',
  optimizeDeps: {
    // manifold-3d ships an ES module that loads its WASM via import.meta.url.
    // Letting Vite pre-bundle it breaks that resolution in dev.
    exclude: ['manifold-3d'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'ロボットアーム・コンフィギュレータ',
        short_name: 'RobotArmCAD',
        description:
          '教育用ロボットアームをブラウザだけで設計し、URDF + STL を出力するツール',
        lang: 'ja',
        theme_color: '#0f1117',
        background_color: '#0f1117',
        display: 'standalone',
        orientation: 'landscape-primary',
        scope: '/Robot_Arm_Configurator/',
        start_url: '/Robot_Arm_Configurator/',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512 1024x1024',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2,json,wasm}'],
        navigateFallback: '/Robot_Arm_Configurator/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
