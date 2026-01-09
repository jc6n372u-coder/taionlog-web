import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'child_process'

// Gitから情報を取得する関数
const getGitInfo = () => {
  try {
    // コミットハッシュ（短縮版）を取得
    const hash = execSync('git rev-parse --short HEAD').toString().trim()
    // 最終コミット日時を取得
    const date = execSync('git log -1 --format=%cd --date=format:"%Y/%m/%d %H:%M"').toString().trim()
    return { hash, date }
  } catch (e) {
    // Gitがない環境用（現在日時を入れる）
    const now = new Date()
    return { 
      hash: 'dev', 
      date: `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()}` 
    }
  }
}

const { hash, date } = getGitInfo()

export default defineConfig({
  // アプリ内で使える変数として定義
  define: {
    __APP_VERSION__: JSON.stringify(hash),
    __APP_UPDATED_AT__: JSON.stringify(date),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'たいおんログ',
        short_name: 'たいおんログ',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
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