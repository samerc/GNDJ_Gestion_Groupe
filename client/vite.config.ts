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
const pkgVersion = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'package.json'), 'utf-8')).version as string
function safeGit(cmd: string, fallback: string): string {
  try { return execSync(cmd, { cwd: import.meta.dirname }).toString().trim() } catch { return fallback }
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
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split stable third-party libs into their own chunks so they stay cached across deploys (a code
        // change in our app doesn't bust the vendor chunk). Only the genuinely shell-shared vendors are named
        // here; the heavy editor (TipTap) and dnd-kit libs are left to auto-split so they load ONLY on the
        // lazy routes that import them (see the NOTE at the bottom).
        manualChunks(id) {
          // Normalize to POSIX slashes FIRST. Rollup passes Windows ids with backslashes
          // (…\node_modules\react\index.js), so a rule like id.includes('/react/') silently never matched on
          // Windows — which let the shared React runtime (react, react-dom, jsx-runtime, use-sync-external-store)
          // get auto-co-located into the heavy editor-vendor/dnd-vendor chunks, forcing those (~125 KB gz TipTap,
          // dnd-kit) to be modulepreloaded on EVERY page. The `@tiptap`/`@dnd-kit`/`@tanstack` rules worked only
          // because they don't depend on a surrounding slash.
          const p = id.replace(/\\/g, '/')
          if (!p.includes('/node_modules/')) return
          // The shared React runtime + the useSyncExternalStore shim (zustand/tanstack) — matched FIRST so these
          // small CJS modules land in react-vendor (loaded on every page anyway) instead of leaking into the
          // heavy lazy chunks below. This is what keeps editor-vendor/dnd-vendor OUT of the initial load.
          if (/\/node_modules\/(react|react-dom|scheduler|use-sync-external-store)\//.test(p)) return 'react-vendor'
          if (p.includes('/react-router')) return 'react-vendor'
          if (p.includes('/@tanstack/')) return 'query-vendor'
          // Small shell-shared UI libs (the always-mounted stores + CommandPalette + shadcn/Radix dialogs) get
          // their own bucket so they can't be folded into editor-vendor/dnd-vendor either.
          if (p.includes('/zustand/') || p.includes('/cmdk/') || p.includes('/@radix-ui/')) return 'ui-vendor'
          // NOTE: @tiptap/prosemirror and @dnd-kit are deliberately NOT forced into a manual chunk. They are
          // imported ONLY by lazy CMS/reorder routes, so letting the bundler auto-split them keeps them in
          // on-demand chunks. Forcing them into a named manual chunk made the bundler duplicate the shared React
          // runtime into that chunk, which then got statically pulled onto every page via the shell.
        },
      },
    },
  },
  server: {
    // Pin the dev server + API proxy to IPv4 (127.0.0.1) rather than "localhost". On newer Node the DNS
    // result order is "verbatim", so "localhost" can resolve to IPv6 ::1 — but the backend listens on IPv4
    // 127.0.0.1:5000 only, so a "localhost" proxy target silently hangs every /api call (endless dashboard
    // spinner). Binding the host to 127.0.0.1 keeps the browser on IPv4 too. Open http://127.0.0.1:5173.
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
})
