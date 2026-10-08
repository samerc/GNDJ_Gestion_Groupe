// One-off walkthrough of a newly accepted family's first visit (activation link → password → login → first
// screens), on a phone viewport, with a screenshot per step. Usage: node newcomer_walk.mjs <activationUrl> <outDir>
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const [url, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', args: ['--no-proxy-server'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fr-FR' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`) })
let n = 0
const shot = async (name) => { await page.waitForTimeout(900); await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: true }); console.log('shot', n, name, page.url()) }

await page.goto(url)
await page.waitForLoadState('networkidle')
await shot('activation')
const pw = 'Bienvenue2026!'
const inputs = page.locator('input[type="password"]')
await inputs.nth(0).fill(pw)
if (await inputs.count() > 1) await inputs.nth(1).fill(pw)
await shot('activation-filled')
await page.locator('button[type="submit"]').click()
await page.waitForTimeout(2500)
await shot('after-activation')

// If we landed on the login page, sign in with the username from the URL.
if (page.url().includes('/login')) {
  const user = decodeURIComponent(new URL(url).searchParams.get('email'))
  await page.locator('input[autocomplete="username"]').fill(user)
  await page.locator('input[type="password"]').fill(pw)
  await shot('login-filled')
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(3500)
}
await shot('first-screen')
// Walk through any dialogs that show on first login (contact review, welcome tour…), screenshot each.
for (let i = 0; i < 8; i++) {
  const dlg = page.locator('[role="dialog"]').first()
  if (!(await dlg.isVisible().catch(() => false))) break
  await shot(`dialog-${i}`)
  const next = dlg.getByRole('button', { name: /Suivant|Plus tard|Commencer|Terminer|C'est parti|Fermer/i }).first()
  if (await next.isVisible().catch(() => false)) { await next.click(); await page.waitForTimeout(800) } else break
}
await shot('after-dialogs')
await page.goto(url.split('/reset-password')[0] + '/my-profile'); await page.waitForTimeout(2500); await shot('ma-fiche')
await page.goto(url.split('/reset-password')[0] + '/my-documents'); await page.waitForTimeout(2500); await shot('mes-documents')
const fill = page.getByRole('button', { name: /Remplir/i }).first()
if (await fill.isVisible().catch(() => false)) {
  await fill.click(); await page.waitForTimeout(2000)
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-online-form.png` }); console.log('shot', n, 'online-form')
  const dlg = page.locator('[role="dialog"]').first()
  await dlg.evaluate((d) => { d.scrollTop = d.scrollHeight }).catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-online-form-end.png` }); console.log('shot', n, 'online-form-end')
}
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)))
await browser.close()
