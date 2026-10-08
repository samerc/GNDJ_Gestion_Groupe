// Page-load probe (manual perf tool, not part of run.ps1): opens the main pages of the PRODUCTION build in Edge as
// an admin, a chef d'unité and a youth member, and prints per page: time until the page has settled, the number of
// API calls, any call made twice (same URL), and the JS loaded. Run against a local `vite preview` of a build:
//   node tests/e2e/page_probe.mjs http://127.0.0.1:4180 <adminEmail> <cuEmail> <youthEmail> <password>
// The accounts must share the given password (temporarily set it on dev with psql, then restore).
import { chromium } from 'playwright-core'

const [APP, ADMIN, CU, YOUTH, PASSWORD] = process.argv.slice(2)
if (!/127\.0\.0\.1|localhost/.test(APP ?? '')) { console.error('Local only.'); process.exit(2) }
const BROWSER = process.env.GNDJ_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await chromium.launch({ executablePath: BROWSER, args: ['--no-proxy-server'] })

async function run(label, email, paths) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()
  let calls = []
  let jsBytes = 0
  page.on('request', (r) => { if (r.url().includes('/api/')) calls.push(r.url().replace(APP, '')) })
  page.on('response', async (r) => {
    if (r.url().endsWith('.js')) { try { jsBytes += (await r.body()).length } catch { /* ignore */ } }
  })
  await page.goto(`${APP}/login`)
  await page.getByPlaceholder(/scouts\.gndj/i).first().fill(email).catch(() => {})
  await page.locator('input[type=password]').first().fill(PASSWORD)
  await page.locator('button[type=submit]').first().click()
  await page.waitForURL(/dashboard|ma-fiche|my-profile/, { timeout: 20000 }).catch(() => {})
  await page.waitForLoadState('networkidle')
  // Close any first-login popup (contact review / welcome tour).
  for (const name of [/Plus tard/i, /Passer/i, /Fermer/i]) await page.getByRole('button', { name }).first().click({ timeout: 800 }).catch(() => {})
  console.log(`\n== ${label} (${email})`)
  for (const p of paths) {
    calls = []; jsBytes = 0
    const t = Date.now()
    await page.goto(`${APP}${p}`)
    await page.waitForLoadState('networkidle')
    const ms = Date.now() - t
    const seen = {}
    for (const c of calls) seen[c] = (seen[c] || 0) + 1
    const dup = Object.entries(seen).filter(([, n]) => n > 1).map(([u, n]) => `${n}x ${u}`)
    console.log(`${String(ms).padStart(6)} ms  ${String(calls.length).padStart(2)} API  ${(jsBytes / 1024).toFixed(0).padStart(5)} KB js  ${p}${dup.length ? `\n         DUP: ${dup.join(' | ')}` : ''}`)
    if (process.env.SHOW_CALLS) for (const c of calls) console.log('           ', c)
  }
  await ctx.close()
}

await run('Super-admin', ADMIN, (process.env.PATHS || '/dashboard,/members,/admin/demandes,/admin/cotisations,/rentree,/calendrier,/admin/settings,/admin/camps').split(','))
if (!process.env.PATHS) await run("Chef d'unité", CU, ['/dashboard', '/unit-documents', '/passage', '/attendance', '/my-profile'])
if (!process.env.PATHS) await run('Jeune', YOUTH, ['/dashboard', '/my-profile', '/my-documents', '/ma-famille', '/calendrier'])
await browser.close()
