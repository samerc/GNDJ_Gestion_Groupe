// Exports every guide (or the ones named) to PDF in docs/help/pdf, from the app's own print view — so the PDF is
// exactly what users see in "Aide", diagrams and screenshots included. Signs in as the super-admin (who can read
// every guide) on the LOCAL dev app.   node pdf.mjs [slug ...]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { APP, ROOT, openBrowser, signIn, signOutAll } from './lib.mjs'

const OUT = join(ROOT, 'docs', 'help', 'pdf')
mkdirSync(OUT, { recursive: true })

const browser = await openBrowser()
try {
  const { page } = await signIn(browser, 'admin', { viewport: { width: 1200, height: 900 } })
  const docs = await page.evaluate(async () => {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    return (await fetch('/api/v1/help', { headers: { Authorization: 'Bearer ' + token } })).json()
  })
  const wanted = process.argv.slice(2)
  for (const d of docs.filter((d) => wanted.length === 0 || wanted.includes(d.slug))) {
    await page.goto(`${APP}/aide/imprimer/${d.slug}?noprint=1`)
    await page.waitForSelector('body[data-help-ready="true"]', { timeout: 60000 })
    await page.emulateMedia({ media: 'print' })
    const file = join(OUT, `${d.slug}.pdf`)
    await page.pdf({
      path: file, format: 'A4', printBackground: true,
      margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;color:#94a3b8;width:100%;padding:0 14mm;text-align:right">GNDJ — ${d.title.replace(/</g, '&lt;')}</div>`,
      footerTemplate: '<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    })
    await page.emulateMedia({ media: 'screen' })
    console.log(`  ✓ ${d.slug}.pdf`)
  }
} finally {
  await signOutAll(browser)
  await browser.close()
}
