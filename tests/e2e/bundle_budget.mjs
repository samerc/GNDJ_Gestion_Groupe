// First-load size budget. Builds the frontend into a temp folder (the real client/dist is left alone), then adds up
// what a browser downloads before the first screen: the entry script, the chunks index.html preloads, and the CSS.
// Fails when it grows past the limits, so the savings made on 2026-09-25 (entry 581 -> 399 KB) can't quietly
// disappear again. Raise a limit deliberately (env vars below) when a real feature needs it.
//
//   node tests/e2e/bundle_budget.mjs         (run.ps1 does it unless -SkipBundle)
// Limits (KB): GNDJ_BUDGET_ENTRY_KB (entry script, raw, default 450), GNDJ_BUDGET_FIRSTLOAD_GZ_KB (all first-load
// JS gzipped, default 320).
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '../../client')
const ENTRY_KB = Number(process.env.GNDJ_BUDGET_ENTRY_KB || 450)
const FIRSTLOAD_GZ_KB = Number(process.env.GNDJ_BUDGET_FIRSTLOAD_GZ_KB || 320)

const out = mkdtempSync(join(tmpdir(), 'gndj-budget-'))
let failed = false
try {
  console.log('Building the frontend (vite build)...')
  execSync(`npx vite build --outDir "${out}" --emptyOutDir --logLevel error`, { cwd: client, stdio: 'inherit' })

  const html = readFileSync(join(out, 'index.html'), 'utf8')
  const entry = [...html.matchAll(/<script[^>]+type="module"[^>]+src="\/([^"]+)"/g)].map((m) => m[1])
  const preload = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+)"/g)].map((m) => m[1])
  const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\/([^"]+)"/g)].map((m) => m[1])
  const size = (f) => statSync(join(out, f)).size
  const gz = (f) => gzipSync(readFileSync(join(out, f))).length
  const kb = (n) => (n / 1024).toFixed(0)

  const entryRaw = entry.reduce((n, f) => n + size(f), 0)
  const js = [...new Set([...entry, ...preload])]
  const jsRaw = js.reduce((n, f) => n + size(f), 0)
  const jsGz = js.reduce((n, f) => n + gz(f), 0)
  const cssGz = css.reduce((n, f) => n + gz(f), 0)

  console.log(`  entry script        ${kb(entryRaw)} KB raw        (limit ${ENTRY_KB} KB)`)
  console.log(`  first-load JS       ${kb(jsRaw)} KB raw / ${kb(jsGz)} KB gzip  (limit ${FIRSTLOAD_GZ_KB} KB gzip, ${js.length} file(s))`)
  console.log(`  CSS                 ${kb(cssGz)} KB gzip`)
  if (entryRaw / 1024 > ENTRY_KB) { console.log(`  FAIL entry script over budget`); failed = true }
  if (jsGz / 1024 > FIRSTLOAD_GZ_KB) { console.log(`  FAIL first-load JS over budget`); failed = true }
  if (!failed) console.log('  PASS first-load size within budget')
} finally {
  rmSync(out, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
