// Takes the guide screenshots (docs/help/img) on the LOCAL dev app, with every real name/email/phone replaced by
// a fake one (see lib.mjs). Run: node capture.mjs [group ...]   groups: public member cu cg admin (default: all)
// Each shot is independent: a failing one is reported and the rest continue. Re-run a group after UI changes.
import {
  APP, openBrowser, signIn, shoot, loadNameMap, settle, dismissPopups, signOutAll,
} from './lib.mjs'
import { readFileSync } from 'node:fs'

const map = loadNameMap()
const want = process.argv.slice(2)
const run = (g) => want.length === 0 || want.includes(g)
const failures = []

async function safe(name, fn) {
  try { await fn() } catch (e) { failures.push(name); console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`) }
}

// Opens the member file of a youth (not the leader himself): the Nth row of the roster.
async function openMember(page, index = 6) {
  await page.goto(`${APP}/dashboard`); await settle(page)
  const rows = page.locator('main [class*="cursor-pointer"]').filter({ hasText: /[A-Z]{2,}/ })
  await rows.nth(index).click(); await settle(page)
}

// Uploads tools/help-docs/sample-document.png (a clearly fictitious form) as the FIRST member's first document type,
// so the check dialog has a real file to show. Returns the new document id (deleted afterwards by deleteDoc).
async function uploadSample(page) {
  const b64 = readFileSync(new URL('./sample-document.png', import.meta.url)).toString('base64')
  return page.evaluate(async (b64) => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    const h = { Authorization: 'Bearer ' + token }
    const me = await (await fetch('/api/v1/auth/me', { headers: h })).json()
    const unitId = me.unitAccess.find((u) => u.isLeader)?.unitId ?? me.unitAccess[0].unitId
    const year = (await (await fetch('/api/v1/settings/passage.scout_year', { headers: h })).json()).value
    const matrix = await (await fetch(`/api/v1/documents/unit/${unitId}/matrix?scoutYear=${year}`, { headers: h })).json()
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const fd = new FormData()
    fd.append('memberId', matrix.members[0].memberId)
    fd.append('documentTypeId', matrix.docTypes[0].id)
    fd.append('files', new Blob([bytes], { type: 'image/png' }), 'fiche-exemple.png')
    const res = await fetch('/api/v1/documents/upload', { method: 'POST', headers: h, body: fd })
    return (await res.json()).id
  }, b64)
}

async function deleteDoc(page, id) {
  if (!id) return
  await page.evaluate(async (id) => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    await fetch(`/api/v1/documents/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } })
  }, id)
}

async function tab(page, name) {
  await page.getByRole('tab', { name: new RegExp(name) }).first().click(); await settle(page, 700)
}

const browser = await openBrowser()
try {
  // ------------------------------------------------------------------------------------------ public / login
  if (run('public')) {
    console.log('== public')
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'fr-FR' })
    const page = await ctx.newPage()
    await safe('login', async () => {
      await page.goto(`${APP}/login`, { waitUntil: 'networkidle' })
      await page.fill('#email', 'prenom.nom@scouts.gndj')
      await shoot(page, 'login', map)
    })
    await safe('login-aide', async () => {
      await page.goto(`${APP}/forgot-password`, { waitUntil: 'networkidle' })
      await shoot(page, 'mot-de-passe-oublie', map)
    })
    await safe('inscription-login', async () => {
      await page.goto(`${APP}/inscription/login`, { waitUntil: 'networkidle' })
      await shoot(page, 'inscription-login', map)
    })
    await ctx.close()
  }

  // ------------------------------------------------------------------------------------------ chef d'unité
  if (run('cu')) {
    console.log("== chef d'unité")
    const { page } = await signIn(browser, 'cu')
    await safe('cu-mon-unite', async () => { await page.goto(`${APP}/dashboard`); await settle(page); await shoot(page, 'cu-mon-unite', map) })
    await safe('cu-fiche', async () => {
      await openMember(page)
      await shoot(page, 'cu-fiche-informations', map)
      await tab(page, 'Contact'); await shoot(page, 'cu-fiche-contact', map)
      await tab(page, 'Unités'); await shoot(page, 'cu-fiche-postes', map)
      await tab(page, 'Documents'); await shoot(page, 'cu-fiche-documents', map)
      await tab(page, 'Progression'); await shoot(page, 'cu-fiche-progression', map)
    })
    await safe('cu-fiche-actions', async () => {
      await openMember(page)
      await page.getByRole('button', { name: /Actions/ }).first().click(); await page.waitForTimeout(500)
      await shoot(page, 'cu-fiche-actions', map)
      await page.keyboard.press('Escape')
    })
    await safe('cu-personnaliser', async () => {
      await page.goto(`${APP}/dashboard`); await settle(page)
      await page.getByRole('button', { name: /Personnaliser/ }).first().click(); await page.waitForTimeout(600)
      await shoot(page, 'cu-personnaliser', map, { target: page.getByRole('dialog') })
      await page.keyboard.press('Escape')
    })
    for (const [name, path] of [
      ['cu-organiser', '/organiser'], ['cu-modifications', '/change-requests'], ['cu-documents', '/unit-documents'],
      ['cu-reunions', '/attendance'], ['cu-passage', '/passage'], ['cu-photo', '/photo-session'],
      ['cu-rentree', '/rentree'], ['cu-rapports', '/admin/report-templates'], ['cu-aide', '/aide'],
    ]) {
      await safe(name, async () => { await page.goto(`${APP}${path}`); await settle(page, 1200); await dismissPopups(page); await shoot(page, name, map) })
    }
    await safe('cu-reunion-nouvelle', async () => {
      await page.goto(`${APP}/attendance`); await settle(page)
      await page.getByRole('button', { name: /Nouvelle réunion/ }).click(); await page.waitForTimeout(700)
      await shoot(page, 'cu-reunion-nouvelle', map, { target: page.getByRole('dialog') })
      await page.keyboard.press('Escape')
    })
    await safe('cu-passage-proposer', async () => {
      await page.goto(`${APP}/passage`); await settle(page)
      await page.locator('tbody tr').nth(1).locator('button').first().click(); await page.waitForTimeout(700)
      await shoot(page, 'cu-passage-ligne', map, { target: page.locator('tbody tr').nth(1) })
      await page.keyboard.press('Escape')
    })
    await safe('cu-document-verifier', async () => {
      // The dev database's document files aren't on this machine: upload a clearly fictitious sample for a member
      // of the unit, screenshot its check dialog, then delete it.
      const docId = await uploadSample(page)
      try {
        await page.goto(`${APP}/unit-documents`); await settle(page)
        // First member row (team header rows have a single cell), first document column.
        await page.locator('main table tbody tr').filter({ has: page.locator('td:nth-child(3)') }).first().locator('td').nth(1).locator('button, [role=button], div').first().click()
        await settle(page, 2000)
        await shoot(page, 'cu-document-verifier', map, { target: page.getByRole('dialog') })
        await page.keyboard.press('Escape')
      } finally { await deleteDoc(page, docId) }
    })
    await safe('cu-notifications', async () => {
      await page.goto(`${APP}/dashboard`); await settle(page)
      await page.getByRole('button', { name: /[Nn]otification/ }).first().click(); await page.waitForTimeout(700)
      await shoot(page, 'cu-notifications', map)
      await page.keyboard.press('Escape')
    })
    await safe('cu-recherche', async () => {
      await page.keyboard.press('Control+k'); await page.waitForTimeout(500)
      await page.keyboard.type('mar'); await page.waitForTimeout(1200)
      await shoot(page, 'cu-recherche', map)
      await page.keyboard.press('Escape')
    })

    // Phone
    const phone = await signIn(browser, 'cu', { viewport: { width: 390, height: 844 }, mobile: true })
    await safe('cu-mobile-unite', async () => { await shoot(phone.page, 'cu-mobile-unite', map) })
    await safe('cu-mobile-fiche', async () => {
      await phone.page.locator('main [class*="cursor-pointer"]').filter({ hasText: /[A-Z]{2,}/ }).nth(6).click()
      await settle(phone.page); await shoot(phone.page, 'cu-mobile-fiche', map)
    })
  }
} finally {
  await signOutAll(browser)
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} shot(s) failed: ${failures.join(', ')}` : '\nAll shots taken.')
