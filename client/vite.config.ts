import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

// Bake the release identity into the bundle at build time. Version comes from package.json (bumped by
// deploy/bump.ps1); the short commit + build date are captured from git so we can always tell exactly
// which build is live — even if a version bump was forgotten. Git may be absent when building from a
// published package, so we fall back gracefully.
const pkgVersion = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version as string
function safeGit(cmd: string, fallback: string): string {
  try { return execSync(cmd, { cwd: __dirname }).toString().trim() } catch { return fallback }
}
const gitCommit = safeGit('git rev-parse --short HEAD', 'dev')
const buildDate = new Date().toISOString().slice(0, 10) // yyyy-MM-dd (build day, UTC)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
    __BUILD_COMMIT__: JSON.stringify(gitCommit),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
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
