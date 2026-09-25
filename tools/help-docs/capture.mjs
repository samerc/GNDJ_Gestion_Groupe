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

  // ------------------------------------------------------------------------------------------ family portal
  // The enrolment window is usually closed on dev: it is opened for the capture (settings restored afterwards),
  // a FICTITIOUS family account + demande is created, screenshotted step by step, then deleted.
  if (run('portal')) {
    console.log('== portail des inscriptions')
    const admin = await signIn(browser, 'admin')
    const api = (method, path, body) => admin.page.evaluate(async ({ method, path, body }) => {
      const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
      const r = await fetch('/api/v1' + path, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null }
    }, { method, path, body })
    const keys = ['demande.enabled', 'demande.submissions_open', 'demande.submission_start', 'demande.submission_deadline', 'demande.require_email_verification']
    const saved = {}
    for (const k of keys) saved[k] = (await api('GET', `/settings/${k}`)).body?.value ?? ''
    const set = (k, v) => api('PUT', `/settings/${k}`, { key: k, value: v })
    const today = new Date(); const iso = (d) => d.toISOString().slice(0, 10)
    const email = `famille.exemple.${Date.now()}@exemple.com`
    let accountId = null
    try {
      await set('demande.enabled', 'true'); await set('demande.submissions_open', 'true')
      await set('demande.submission_start', iso(new Date(today.getTime() - 86400000)))
      await set('demande.submission_deadline', iso(new Date(today.getTime() + 20 * 86400000)))
      await set('demande.require_email_verification', 'false')

      const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'fr-FR' })
      const p = await ctx.newPage()
      await safe('inscription-login', async () => { await p.goto(`${APP}/inscription/login`, { waitUntil: 'networkidle' }); await shoot(p, 'inscription-login', map) })
      await safe('inscription-compte', async () => {
        await p.goto(`${APP}/inscription/register`, { waitUntil: 'networkidle' })
        const inputs = p.locator('form input:not([type=checkbox]):not([name=website])')
        await inputs.nth(0).fill('Nadia KHOURY').catch(() => {})
        await shoot(p, 'inscription-compte', map)
      })
      // Account + household + draft through the API (fast and exact), then the UI for the screenshots.
      const reg = await p.evaluate(async (email) => {
        const r = await fetch('/api/v1/applicant/register', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'Exemple2026!', contactName: 'Nadia KHOURY', acceptedTerms: true }) })
        return { status: r.status, body: await r.json() }
      }, email)
      if (reg.status !== 200) throw new Error(`register ${reg.status} ${JSON.stringify(reg.body)}`)
      await p.goto(`${APP}/inscription/login`, { waitUntil: 'networkidle' })
      await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'Exemple2026!')
      await p.click('button[type=submit]'); await settle(p, 2000)
      await safe('inscription-conditions', async () => { if (p.url().includes('conditions')) await shoot(p, 'inscription-conditions', map) })
      const demandeId = await p.evaluate(async () => {
        const t = localStorage.getItem('applicantAccessToken') || sessionStorage.getItem('applicantAccessToken')
        const h = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
        await fetch('/api/v1/applicant/accept-terms', { method: 'POST', headers: h })
        await fetch('/api/v1/applicant/household', { method: 'PUT', headers: h, body: JSON.stringify({
          contactName: 'Nadia KHOURY', addressCountry: 'Liban', addressCity: 'Hazmieh', addressDetails: 'Rue des Pins, immeuble Cèdre, 2e étage',
          parentsSituation: 'Unis', primaryContactEmail: null,
          guardians: [
            { id: null, relationship: 'Père', firstName: 'Karim', lastName: 'KHOURY', profession: 'Ingénieur', professionDomain: null, phoneCountryCode: '+961', phoneNumber: '70 123 456', email: 'karim.exemple@exemple.com', isDeceased: false, isPrimaryContact: false, isEmergencyContact: true },
            { id: null, relationship: 'Mère', firstName: 'Nadia', lastName: 'KHOURY', profession: 'Pharmacienne', professionDomain: null, phoneCountryCode: '+961', phoneNumber: '71 234 567', email: 'nadia.exemple@exemple.com', isDeceased: false, isPrimaryContact: true, isEmergencyContact: true },
          ],
          scoutRelations: [],
        }) })
        const r = await fetch('/api/v1/applicant/demandes', { method: 'POST', headers: h, body: JSON.stringify({ data: {
          firstName: 'Élie', lastName: 'KHOURY', dateOfBirth: '2017-03-14', gender: 'Masculin', nationality: 'Libanaise',
          school: 'Collège Notre-Dame de Jamhour', classe: '4ème', section: null, bloodType: 'O+', medicalNotes: null,
          allergies: null, phoneCountryCode: null, phoneNumber: null, email: null, parentNotes: null } }) })
        const b = await r.json(); return typeof b === 'string' ? b : b.id
      })
      await safe('inscription-portail', async () => { await p.goto(`${APP}/inscription/portail`); await settle(p, 1500); await shoot(p, 'inscription-portail', map) })
      await safe('inscription-etapes', async () => {
        await p.goto(`${APP}/inscription/portail/demande/${demandeId}`); await settle(p, 1500)
        await shoot(p, 'inscription-etape-enfant', map, { fullPage: true })
        const steps = ['Parents', 'Proches', 'Récap']
        for (const [i, s] of steps.entries()) {
          await p.getByRole('button', { name: new RegExp(s) }).first().click(); await settle(p, 1000)
          await shoot(p, ['inscription-etape-parents', 'inscription-etape-proches', 'inscription-etape-recap'][i], map, { fullPage: true })
        }
      })
      accountId = (await api('GET', `/demandes/accounts?search=${encodeURIComponent(email)}`)).body?.items?.[0]?.id
        ?? (await api('GET', `/demandes/accounts?search=${encodeURIComponent(email)}`)).body?.[0]?.id
      await ctx.close()
    } finally {
      if (accountId) console.log('  cleanup account', (await api('DELETE', `/demandes/accounts/${accountId}`)).status)
      else console.log(`  ⚠ could not find the test account ${email} to delete — remove it in Comptes d'inscription`)
      for (const k of keys) await set(k, saved[k])
    }
  }

  // ------------------------------------------------------------------------------------------ member
  if (run('member')) {
    console.log('== membre')
    const { page } = await signIn(browser, 'member')
    await safe('membre-fiche', async () => {
      await page.goto(`${APP}/my-profile`); await settle(page, 1200); await dismissPopups(page)
      await shoot(page, 'membre-fiche', map)
      for (const [t, name] of [['Contact', 'membre-contact'], ['Unités', 'membre-postes'], ['Progression', 'membre-progression'], ['Médical', 'membre-medical']]) {
        await safe(name, async () => { await tab(page, t); await shoot(page, name, map) })
      }
    })
    await safe('membre-documents', async () => { await page.goto(`${APP}/my-documents`); await settle(page, 1200); await shoot(page, 'membre-documents', map, { fullPage: true }) })
    await safe('membre-trombinoscope', async () => { await page.goto(`${APP}/my-trombinoscope`); await settle(page, 1200); await shoot(page, 'membre-trombinoscope', map) })
    await safe('membre-menu', async () => {
      await page.goto(`${APP}/my-profile`); await settle(page)
      await page.locator('header button').filter({ hasText: /[A-Z]{2}/ }).last().click(); await page.waitForTimeout(600)
      await shoot(page, 'membre-menu', map)
      await page.keyboard.press('Escape')
    })
    const phone = await signIn(browser, 'member', { viewport: { width: 390, height: 844 }, mobile: true })
    await safe('membre-mobile-fiche', async () => { await phone.page.goto(`${APP}/my-profile`); await settle(phone.page, 1200); await dismissPopups(phone.page); await shoot(phone.page, 'membre-mobile-fiche', map) })
    await safe('membre-mobile-documents', async () => { await phone.page.goto(`${APP}/my-documents`); await settle(phone.page, 1200); await shoot(phone.page, 'membre-mobile-documents', map) })
    await safe('membre-mobile-menu', async () => {
      await phone.page.locator('header button:has(svg.lucide-menu)').first().click(); await phone.page.waitForTimeout(700)
      await shoot(phone.page, 'membre-mobile-menu', map)
    })
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
  // ------------------------------------------------------------------------------------------ chef de groupe
  if (run('cg')) {
    console.log('== chef de groupe')
    const { page } = await signIn(browser, 'cg', { viewport: { width: 1440, height: 900 } })
    for (const [name, path, opts] of [
      ['cg-accueil', '/dashboard'],
      ['cg-rentree', '/rentree'],
      ['cg-demandes', '/admin/demandes'],
      ['cg-demande-stats', '/admin/demande-stats'],
      ['cg-demande-comptes', '/admin/demande-accounts'],
      ['cg-passage', '/admin/passage-validation'],
      ['cg-cotisations', '/admin/cotisations'],
      ['cg-documents-suivi', '/admin/documents-suivi'],
      ['cg-qualite', '/admin/data-quality'],
      ['cg-membres', '/members'],
      ['cg-maitrises', '/maitrises'],
      ['cg-groupes', '/admin/member-groups'],
      ['cg-fratries', '/admin/siblings'],
      ['cg-communications', '/admin/communications-acces'],
      ['cg-notification', '/admin/send-notification'],
      ['cg-parametres', '/admin/settings'],
      ['cg-acces', '/admin/roles-access'],
      ['cg-progression', '/admin/progression'],
      ['cg-unites', '/units'],
      ['cg-actualites', '/admin/news'],
    ]) {
      await safe(name, async () => { await page.goto(`${APP}${path}`); await settle(page, 1500); await dismissPopups(page); await shoot(page, name, map, opts) })
    }
    await safe('cg-menu', async () => {
      await page.goto(`${APP}/dashboard`); await settle(page)
      await page.locator('header').getByRole('button', { name: /Suivi/ }).first().click(); await page.waitForTimeout(600)
      await shoot(page, 'cg-menu', map)
      await page.keyboard.press('Escape')
    })
    await safe('cg-passage-projection', async () => {
      await page.goto(`${APP}/admin/passage-validation`); await settle(page, 1500)
      await page.getByText(/Projection de l'année prochaine/).first().click(); await settle(page, 1500)
      await page.getByText(/Projection de l'année prochaine/).first().scrollIntoViewIfNeeded()
      await shoot(page, 'cg-passage-projection', map)
    })
  }

  // ------------------------------------------------------------------------------------------ super-admin
  if (run('admin')) {
    console.log('== super-admin')
    const { page } = await signIn(browser, 'admin', { viewport: { width: 1440, height: 900 } })
    for (const [name, path] of [
      ['admin-systeme', '/admin/system'],
      ['admin-file-emails', '/admin/email-outbox'],
      ['admin-erreurs', '/admin/error-log'],
      ['admin-sessions', '/admin/sessions'],
      ['admin-audit', '/admin/audit-logs'],
      ['admin-corbeille', '/admin/deleted-members'],
      ['admin-parametres-email', '/admin/settings?tab=email'],
      ['admin-parametres-securite', '/admin/settings?tab=security'],
      ['admin-parametres-maintenance', '/admin/settings?tab=maintenance'],
      ['admin-smtp', '/admin/settings?tab=cfg:smtp'],
      ['admin-modeles-email', '/admin/settings?tab=cfg:email-templates'],
      ['admin-versions', '/admin/changelog'],
    ]) {
      await safe(name, async () => { await page.goto(`${APP}${path}`); await settle(page, 1500); await dismissPopups(page); await shoot(page, name, map) })
    }
  }
} finally {
  await signOutAll(browser)
  await browser.close()
}
console.log(failures.length ? `\n${failures.length} shot(s) failed: ${failures.join(', ')}` : '\nAll shots taken.')
