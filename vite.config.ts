import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // ★修正: favicon.svg を消して、今回作ったファイルを追加
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'たいおんログ',
        short_name: 'たいおんログ',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          // ★修正: ファイル名を変更
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
      }
    })
  ]
})