// GNDJ end-to-end BROWSER smoke tests - run against the LOCAL dev app (Vite :5173 + API :5000) before a deploy.
// Drives the installed Microsoft Edge through playwright-core (no browser download). Covers the flows people use
// every day: login, the CU roster + member file, the phone back button (member file + installed app), the offline
// screen, and a few admin pages. Signs its test sessions out at the end.
//
//   cd tests/e2e && npm install   (once)      then:   node ui_smoke.mjs
// Settings (env): GNDJ_APP (http://localhost:5173), GNDJ_PASSWORD, GNDJ_ADMIN, GNDJ_CU, GNDJ_BROWSER (Edge path).
import { chromium } from 'playwright-core'

const APP = (process.env.GNDJ_APP || 'http://localhost:5173').replace(/\/$/, '')
const PWD = process.env.GNDJ_PASSWORD || 'Gndj2026!'
const ADMIN = process.env.GNDJ_ADMIN || 'admin@gndj.local'
const CU = process.env.GNDJ_CU || 'wissam.azouri@scouts.gndj'
const BROWSER = process.env.GNDJ_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
if (!/localhost|127\.0\.0\.1/.test(APP)) { console.error(`Refusing to run against ${APP}: local dev only.`); process.exit(2) }

const results = []
const check = (name, ok, detail = '') => {
  results.push([name, !!ok])
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail !== '' ? `   [${detail}]` : ''}`)
}
const section = (t) => console.log(`\n== ${t}`)
const errors = []
const browser = await chromium.launch({ executablePath: BROWSER })
const contexts = []

// Installed-app (PWA) emulation: report display-mode: standalone.
const STANDALONE = () => {
  const orig = window.matchMedia.bind(window)
  window.matchMedia = (q) => q.includes('display-mode: standalone')
    ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } }
    : orig(q)
}

async function signIn(email, { viewport = { width: 1300, height: 900 }, standalone = false } = {}) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 })
  contexts.push(ctx)
  if (standalone) await ctx.addInitScript(STANDALONE)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`))
  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' }) // like the installed icon (start_url)
  await page.fill('#email', email)
  await page.fill('#password', PWD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 30000 })
  await page.waitForTimeout(2000)
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(250) } // first-login popups
  return page
}
const idx = (p) => p.evaluate(() => window.history.state?.idx ?? 0)

try {
  section('Login screens')
  {
    const ctx = await browser.newContext(); contexts.push(ctx)
    const p = await ctx.newPage(); p.on('pageerror', (e) => errors.push(e.message))
    await p.goto(`${APP}/login`, { waitUntil: 'networkidle' })
    check('member login page', await p.locator('#email').isVisible() && await p.locator('#password').isVisible())
    await p.goto(`${APP}/inscription/login`, { waitUntil: 'networkidle' })
    check('parent portal login page', await p.locator('input[type=email], #email').first().isVisible())
  }

  section('Chef d\'unite on a computer')
  const cu = await signIn(CU)
  check('CU lands on the unit roster', await cu.getByText(/Membres/).first().isVisible())
  const rows = cu.locator('main [class*="cursor-pointer"]').filter({ hasText: /[A-Z]{2,}/ })
  await rows.first().click(); await cu.waitForTimeout(1500)
  check('member file opens (tabs visible)', await cu.getByRole('tab').first().isVisible())

  section('Phone: back button closes the member file')
  const phone = await signIn(CU, { viewport: { width: 390, height: 800 } })
  const before = await idx(phone)
  await phone.locator('main [class*="cursor-pointer"]').filter({ hasText: /[A-Z]{2,}/ }).first().click()
  await phone.waitForTimeout(1500)
  check('opening a member adds one history step', (await idx(phone)) === before + 1, `${before} -> ${await idx(phone)}`)
  await phone.goBack(); await phone.waitForTimeout(1200)
  check('back returns to the list, still on the page', phone.url().endsWith('/dashboard') && (await idx(phone)) === before)

  section('Installed app: back from a menu section returns home')
  const app = await signIn(CU, { standalone: true })
  const menu = (name) => app.locator('aside').getByRole('link', { name, exact: true }).click()
  await menu('Mes documents'); await app.waitForURL('**/my-documents')
  await menu('Réunions'); await app.waitForURL('**/attendance')
  await app.waitForTimeout(500)
  check('menu taps keep the history at [home, section]', (await idx(app)) === 1, await idx(app))
  await app.goBack(); await app.waitForTimeout(800)
  check('back from a section -> dashboard (next back closes the app)', app.url().endsWith('/dashboard') && (await idx(app)) === 0)

  section('Offline')
  await cu.reload({ waitUntil: 'networkidle' }); await cu.waitForTimeout(1500)
  const controlled = await cu.evaluate(() => !!navigator.serviceWorker?.controller)
  check('service worker active', controlled)
  await cu.context().setOffline(true); await cu.waitForTimeout(500)
  check('in-app "Pas de connexion" banner', await cu.getByText(/Pas de connexion — les modifications/).isVisible())
  await cu.goto(`${APP}/my-documents`).catch(() => {}); await cu.waitForTimeout(1000)
  check('offline page instead of a blank screen', await cu.getByRole('heading', { name: 'Pas de connexion' }).isVisible())
  await cu.context().setOffline(false)

  section('Admin pages')
  const admin = await signIn(ADMIN, { viewport: { width: 1400, height: 900 } })
  for (const [path, heading] of [
    ['/admin/sessions', 'Sessions actives'],
    ['/admin/data-quality', 'Qualité des données'],
    ['/admin/system', 'Système'],
    ['/aide/guide-administration', "Guide d'administration"],
    ['/admin/settings', 'Paramètres'],
    ['/members', null],
    ['/admin/audit-logs', null],
  ]) {
    await admin.goto(`${APP}${path}`, { waitUntil: 'networkidle' }); await admin.waitForTimeout(1200)
    const ok = heading ? await admin.getByRole('heading', { name: heading }).first().isVisible() : !admin.url().includes('/login')
    check(`opens ${path}`, ok)
  }
  check('Sessions page shows the device column', await (async () => {
    await admin.goto(`${APP}/admin/sessions`, { waitUntil: 'networkidle' }); await admin.waitForTimeout(1000)
    return admin.getByRole('columnheader', { name: 'Appareil' }).isVisible()
  })())

  // Sign the test sessions out (each context = one device).
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      await p.evaluate(async () => {
        const t = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
        if (t) await fetch('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })
      }).catch(() => {})
    }
  }
} catch (e) {
  check(`unexpected error: ${e.message}`, false)
}

check('no JavaScript errors on any page', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
const passed = results.filter(([, ok]) => ok).length
console.log(`\n${passed}/${results.length} browser checks passed`)
for (const [name, ok] of results) if (!ok) console.log(`  FAILED: ${name}`)
process.exit(passed === results.length ? 0 : 1)
