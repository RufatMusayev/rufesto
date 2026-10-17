import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// <link rel="preconnect"> for the two hosts the first screen talks to, injected at build time so no domain is
// hard-coded (preview and prod build the same source with their own VITE_SUPABASE_URL):
//  - the Supabase origin, twice: once for fetch (API + storage signing, CORS mode) and once for <img> (no-cors mode
//    uses its own connection) - signed post photos come from the same origin;
//  - images.unsplash.com, where the dish and promo photos live.
// A relative VITE_SUPABASE_URL (same-origin proxy) needs no preconnect and adds none.
function preconnectHosts(env) {
  return {
    name: 'rufesto-preconnect',
    transformIndexHtml() {
      const tags = []
      const raw = env.VITE_SUPABASE_URL
      if (raw && /^https?:\/\//i.test(raw)) {
        const origin = new URL(raw).origin
        tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: '' }, injectTo: 'head-prepend' })
        tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: origin }, injectTo: 'head-prepend' })
      }
      tags.push({ tag: 'link', attrs: { rel: 'preconnect', href: 'https://images.unsplash.com' }, injectTo: 'head-prepend' })
      return tags
    },
  }
}

// Vendor chunks: libraries that change rarely get their own long-cached files (a deploy of app code does not
// invalidate them), and the heavy ones that only one screen needs - Leaflet (Map) and the QR scanner - stay out of
// the entry bundle. Everything else is split per route in App.jsx.
function vendorChunk(id) {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('/leaflet/')) return 'leaflet'
  if (id.includes('/html5-qrcode/')) return 'qr-scanner'
  if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router)\//.test(id)) return 'react'
  if (id.includes('/node_modules/@supabase/')) return 'supabase'
  if (/\/node_modules\/(i18next|react-i18next|i18next-browser-languagedetector|html-parse-stringify|void-elements)\//.test(id)) return 'i18n'
  return undefined
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), preconnectHosts(env)],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    build: {
      rollupOptions: { output: { manualChunks: vendorChunk } },
    },
    server: {
      port: 5173,
    },
  }
})
