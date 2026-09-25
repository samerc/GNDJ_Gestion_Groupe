// Shared engine for the guide screenshots: sign in as a role on the LOCAL dev app, open a page, replace every
// real name / email / phone with a consistent FAKE one, hide photos, then screenshot into docs/help/img.
// Why fake names instead of blur: the dev database is a copy of prod (real families) — a guide must never show
// them, and a readable fake name makes a clearer screenshot than a smudge.
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const IMG_DIR = join(ROOT, 'docs', 'help', 'img')
export const APP = (process.env.GNDJ_APP || 'http://localhost:5173').replace(/\/$/, '')
const PWD = process.env.GNDJ_PASSWORD || 'Gndj2026!'
const BROWSER = process.env.GNDJ_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PSQL = process.env.GNDJ_PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe'
if (!/localhost|127\.0\.0\.1/.test(APP)) { console.error(`Refusing to run against ${APP}: local dev only.`); process.exit(2) }

// The dev accounts used for each role (override with env vars).
export const ACCOUNTS = {
  member: process.env.GNDJ_MEMBER || 'fayez.a.boudaher@scouts.gndj',
  cu: process.env.GNDJ_CU || 'wissam.azouri@scouts.gndj',
  cg: process.env.GNDJ_CG || 'giorgio.rizk@scouts.gndj',
  admin: process.env.GNDJ_ADMIN || 'admin@gndj.local',
}

// ---- Fake identities --------------------------------------------------------------------------------------

const FIRST_M = ['Karim', 'Élie', 'Joseph', 'Marc', 'Charbel', 'Georges', 'Antoine', 'Rami', 'Fadi', 'Paul', 'Ziad', 'Michel',
  'Toni', 'Jad', 'Chadi', 'Nabil', 'Walid', 'Samir', 'Bechara', 'Hadi', 'Philippe', 'Roy', 'Marwan', 'Serge', 'Nicolas']
const FIRST_F = ['Nadia', 'Maya', 'Léa', 'Rita', 'Yara', 'Nour', 'Tania', 'Sarah', 'Lina', 'Christelle', 'Joëlle', 'Carla',
  'Rana', 'Mira', 'Hala', 'Zeina', 'Dana', 'Layal', 'Cynthia', 'Rola', 'Josiane', 'Clara', 'Ghida', 'Aline', 'Rima']
const FIRST = [...FIRST_M, ...FIRST_F]
const LAST = ['KHOURY', 'HADDAD', 'SAADE', 'NASSAR', 'FRANGIEH', 'SFEIR', 'AOUN', 'KARAM', 'MOUAWAD', 'NAJJAR', 'CHAMOUN',
  'DAHER', 'BOUSTANY', 'RIACHI', 'TAWK', 'HAYEK', 'ZOGHBY', 'MATTA', 'ASMAR', 'GEMAYEL', 'FARES', 'SAKR', 'ABOU JAOUDE',
  'NAKAD', 'HELOU', 'KANAAN', 'SALEM', 'YAZBECK', 'CHEDID', 'ISSA', 'MAALOUF', 'AZAR', 'RIZKALLAH', 'SAYEGH', 'TOHME',
  'BAZ', 'CHALHOUB', 'EID', 'GHANEM', 'KHALIL', 'MOUBARAK', 'NASR', 'RAHME', 'SARKIS', 'TABET', 'WEHBE', 'YOUNES',
  'ZEIDAN', 'BITAR', 'DIB']

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

// Every distinct first / last name in the dev DB (members + parents) → a fake one, stable across screenshots.
export function loadNameMap() {
  // First names come with their gender ('M' / 'F', '?' when unknown) so a girl gets a girl's fake name.
  const sql = `select distinct first_name || '|' || case when gender ilike 'f%' then 'F' when gender ilike 'm%' then 'M' else '?' end from members` +
    ` union select distinct first_name || '|' || case when exists (select 1 from guardian_links l where l.guardian_id = g.id and l.relationship_type ilike 'm%re') then 'F'` +
    ` when exists (select 1 from guardian_links l where l.guardian_id = g.id and l.relationship_type ilike 'p%re') then 'M' else '?' end from guardians g;` +
    ` select '#'; select distinct last_name from members union select distinct last_name from guardians;`
  const out = execFileSync(PSQL, ['-h', 'localhost', '-U', 'gndj_admin', '-d', 'gndj', '-At', '-c', sql],
    { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'GndjDev2026!' }, encoding: 'utf8', maxBuffer: 64 << 20 })
  const [firsts, lasts] = out.split(/^#$/m).map((b) => b.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length >= 3))
  const map = {}
  // A first name used for both genders keeps the gender seen first ('?' rows sort last); names of several words
  // are also replaced word by word (e.g. "Marie-Joe", "ABOU KHALIL").
  const rows = firsts.map((r) => r.split('|')).sort((a, b) => (a[1] === '?') - (b[1] === '?'))
  for (const [name, g] of rows) {
    const list = g === 'F' ? FIRST_F : g === 'M' ? FIRST_M : FIRST
    for (const n of [name, ...name.split(/[\s-]+/)]) if (n.length >= 3 && !(n in map)) map[n] = list[hash('f' + n) % list.length]
  }
  for (const n of new Set(lasts.flatMap((l) => [l, ...l.split(/[\s-]+/)]))) if (n.length >= 3) map[n.toUpperCase()] = LAST[hash('l' + n.toUpperCase()) % LAST.length]
  // A fake name must map to itself: replacing is then idempotent (the page observer re-processes what it changed).
  for (const f of [...FIRST, ...LAST, ...LAST.flatMap((l) => l.split(' '))]) if (f.length >= 3) map[f] = f
  return map
}

// Runs IN THE PAGE: replaces names/emails/phones in every text node and input value, hides member photos, and keeps
// doing it for content that appears later (MutationObserver).
function anonymizeInPage(map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const nameRe = new RegExp(`(?<![\\p{L}])(${keys.join('|')})(?![\\p{L}])`, 'gu')
  const emailRe = /[\p{L}\d._+-]+@[\w-]+(?:\.[\w-]+)+/gu
  // 7 to 10 digits, optionally grouped and prefixed by +961 (old 7-digit and new 8-digit Lebanese numbers).
  const phoneRe = /(?:\+\d{1,3}[\s.-]?)?(?<![\d/])\d(?:[\s.-]?\d){6,9}(?![\d/])/g
  const fix = (t) => {
    if (!t || t.length < 3) return t
    // The group's own addresses (…@gndj.org) and the "prénom.nom" placeholder are not personal: kept as they are.
    let s = t.replace(emailRe, (m) =>
      /@gndj\.org$/i.test(m) || /^pr[ée]nom\.nom@/i.test(m) ? m
        : m.endsWith('@scouts.gndj') ? 'prenom.nom@scouts.gndj' : 'parent@exemple.com')
    s = s.replace(phoneRe, (m) => (/^\d{4}-\d{4}$/.test(m) ? m : m.startsWith('+') ? '+961 70 123 456' : '70 123 456')) // keep scout years
    return s.replace(nameRe, (m) => map[m] ?? m)
  }
  const walk = (root) => {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v }
    root.querySelectorAll?.('input, textarea').forEach((el) => { const v = fix(el.value); if (v !== el.value) el.value = v })
    root.querySelectorAll?.('[title]').forEach((el) => { const v = fix(el.title); if (v !== el.title) el.title = v })
  }
  // Round initials badges ("WA") would still give away the real person: recompute them from the (already fake)
  // name shown next to them.
  // A name line is "LAST First" or "First LAST" on ONE line (e.g. "NAJJAR Wissam", "Wissam NAJJAR").
  const LAST_FIRST = /^([A-ZÀ-Ý][A-ZÀ-Ý' -]{2,}) ([A-ZÀ-Ý][a-zà-ÿ-]+)(?: [A-ZÀ-Ý][a-zà-ÿ-]+)?$/
  const FIRST_LAST = /^([A-ZÀ-Ý][a-zà-ÿ-]+)(?: [A-ZÀ-Ý][a-zà-ÿ-]+)? ([A-ZÀ-Ý][A-ZÀ-Ý' -]{2,})$/
  const fixInitials = (root) => {
    const badges = Array.from(root.querySelectorAll('[class*="rounded-full"], [class*="rounded-xl"], [class*="rounded-2xl"]'))
    for (const badge of badges) {
      const current = badge.textContent.trim()
      if (!/^[A-ZÀ-Ý]{2}$/.test(current)) continue
      let initials = null
      for (let box = badge.parentElement, i = 0; box && i < 8 && !initials; box = box.parentElement, i++) {
        for (const line of box.innerText.split('\n').map((l) => l.trim())) {
          let m = LAST_FIRST.exec(line)
          if (m && m[1] === m[1].toUpperCase()) { initials = m[2][0] + m[1][0]; break }
          m = FIRST_LAST.exec(line)
          if (m) { initials = m[1][0] + m[2][0]; break }
        }
      }
      if (!initials || initials === current) continue
      // Put the initials in the first text node that holds letters; blank the others (e.g. "W" + "A" nodes).
      const tw = document.createTreeWalker(badge, NodeFilter.SHOW_TEXT)
      let done = false
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!/[A-ZÀ-Ý]/.test(n.nodeValue)) continue
        n.nodeValue = done ? '' : initials
        done = true
      }
    }
  }
  const style = document.createElement('style')
  // Member photos are blurred (the fictitious sample document used for screenshots is not).
  style.textContent = 'img[src^="blob:"]:not([alt*="exemple"]):not([src*="exemple"]), img[alt*="Photo"], img[alt*="photo"] { filter: blur(14px) grayscale(1) !important; }'
  document.head.appendChild(style)
  walk(document.body)
  fixInitials(document.body)
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { const v = fix(m.target.nodeValue); if (v !== m.target.nodeValue) m.target.nodeValue = v }
      m.addedNodes.forEach((n) => n.nodeType === 3 ? (n.nodeValue = fix(n.nodeValue)) : n.nodeType === 1 && walk(n))
    }
    fixInitials(document.body)
  }).observe(document.body, { childList: true, subtree: true, characterData: true })
}

// ---- Browser ----------------------------------------------------------------------------------------------

export async function openBrowser() { return chromium.launch({ executablePath: BROWSER }) }

// One signed-in context per role (so each role signs in once). First-login popups are dismissed.
export async function signIn(browser, role, { viewport = { width: 1366, height: 860 }, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'fr-FR' })
  const page = await ctx.newPage()
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', ACCOUNTS[role])
  await page.fill('#password', PWD)
  await page.click('button[type=submit]')
  await page.waitForURL('**/dashboard', { timeout: 30000 })
  await settle(page)
  await dismissPopups(page)
  return { ctx, page }
}

export async function dismissPopups(page) {
  for (let i = 0; i < 4; i++) {
    const later = page.getByRole('button', { name: /Plus tard|Passer|Fermer|Ignorer/ }).first()
    if (await later.isVisible().catch(() => false)) await later.click().catch(() => {})
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
}

export async function settle(page, ms = 900) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

// Anonymize then screenshot. `target` = a locator to clip to (else the viewport, or the full page).
export async function shoot(page, name, map, { target, fullPage = false } = {}) {
  await page.evaluate(anonymizeInPage, map)
  await page.waitForTimeout(400)
  mkdirSync(IMG_DIR, { recursive: true })
  const path = join(IMG_DIR, `${name}.png`)
  if (target) await target.screenshot({ path })
  else await page.screenshot({ path, fullPage })
  console.log(`  ✓ ${name}.png`)
  return path
}

export async function signOutAll(browser) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      await p.evaluate(async () => {
        const t = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
        if (t) await fetch('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } })
      }).catch(() => {})
    }
  }
}
