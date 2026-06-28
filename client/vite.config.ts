import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split stable third-party libs into their own chunks so they stay cached across deploys
        // (a code change in our app doesn't bust the vendor chunk). The heavy editor/dnd libs are
        // only pulled in by the routes that lazy-import them, so they never touch the initial load.
        // Function form (vs a record) avoids a Rollup typing quirk and also catches transitive deps
        // (e.g. prosemirror under @tiptap).
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor-vendor'
          if (id.includes('@dnd-kit')) return 'dnd-vendor'
          if (id.includes('@tanstack')) return 'query-vendor'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react-vendor'
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
