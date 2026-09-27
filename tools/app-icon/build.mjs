// Builds every app icon from ONE design (the compass "médaillon" in the group logo's colours: violet-blue,
// light blue, orange, beige woggle knot). Renders the SVG with the installed Microsoft Edge (playwright-core
// from tests/e2e) and writes into client/public:
//   favicon.svg                 browser tab (vector)
//   icons/app-192.png, app-512  installed app / Android (rounded tile, transparent corners)
//   icons/app-maskable-512.png  Android adaptive icon (full-bleed square, design inside the 80% safe zone)
//   icons/badge-96.png          Android notification badge (white silhouette on transparent; Android only
//                               uses the alpha channel, a coloured square would show as a white block)
//   apple-touch-icon.png        iPhone home screen (180×180 full-bleed square; iOS rounds the corners itself)
// Run from the repo root:  node tools/app-icon/build.mjs   (needs `npm install` once in tests/e2e)
// When changing the design, ALSO rename the PNG files (e.g. app-v3-192.png) and update manifest.webmanifest,
// public/sw.js and index.html — phones and Cloudflare cache icons by URL, so a new name is the only sure refresh.
import { createRequire } from 'module'
import { writeFileSync, mkdirSync } from 'fs'
const require = createRequire(new URL('../../tests/e2e/package.json', import.meta.url))
const { chromium } = require('playwright-core')

// Group logo colours.
const BLUE = '#4a3fc4', BLUE_D = '#241b82', SKY = '#7cc8f2', SKY_D = '#5aa9da'
const ORANGE = '#f28124', ORANGE_D = '#d9621a', KNOT = '#dcbc92', KNOT_D = '#9a7651'

const C = 256
const pt = (a, r) => [C + r * Math.sin(a), C - r * Math.cos(a)] // angle 0 = north, clockwise
const poly = (pts, fill) => `<polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}"/>`

// One compass point, split along its axis into a lit and a shaded half.
function point(angle, L, r, lit, shade) {
  const tip = pt(angle, L), left = pt(angle - Math.PI / 4, r), right = pt(angle + Math.PI / 4, r), c = [C, C]
  return poly([c, left, tip], shade) + poly([c, tip, right], lit)
}
function rose() {
  let s = ''
  for (let i = 0; i < 4; i++) s += point(Math.PI / 4 + i * Math.PI / 2, 118, 36, SKY, SKY_D)
  for (let i = 0; i < 4; i++) s += i === 0 ? point(0, 178, 58, ORANGE, ORANGE_D) : point(i * Math.PI / 2, 178, 58, BLUE, BLUE_D)
  return s
}
// Woggle (Turk's-head knot) in the centre, as on the group logo.
function knot(cx, cy, r) {
  const w = r * 0.11
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${KNOT}" stroke="${KNOT_D}" stroke-width="${w}"/>
    <path d="M${cx - r * .75},${cy - r * .35} Q${cx},${cy - r * 1.05} ${cx + r * .75},${cy - r * .35}
             M${cx - r * .85},${cy + r * .15} Q${cx},${cy - r * .45} ${cx + r * .85},${cy + r * .15}
             M${cx - r * .7},${cy + r * .6} Q${cx},${cy + r * .05} ${cx + r * .7},${cy + r * .6}"
      fill="none" stroke="${KNOT_D}" stroke-width="${w}" stroke-linecap="round"/>`
}
const medallion = `<circle cx="256" cy="256" r="200" fill="#ffffff"/>${rose()}${knot(256, 256, 24)}`
const gradient = `<defs><linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
  <stop stop-color="${BLUE}"/><stop offset="1" stop-color="${BLUE_D}"/></linearGradient></defs>`

// rounded = tile with rounded corners (transparent outside); otherwise a full-bleed square.
// scale shrinks the medallion around the centre (safe zone for maskable / iOS).
function icon({ rounded = true, scale = 1 } = {}) {
  const tile = rounded ? `<rect width="512" height="512" rx="112" fill="url(#bg)"/>` : `<rect width="512" height="512" fill="url(#bg)"/>`
  const body = scale === 1 ? medallion : `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${medallion}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gradient}${tile}${body}</svg>`
}
// Notification badge: the four main points as a white silhouette, with the centre left open.
function badge() {
  let s = ''
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2
    s += poly([[C, C], pt(a - Math.PI / 4, 70), pt(a, 236), pt(a + Math.PI / 4, 70)], '#ffffff')
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><mask id="m"><rect width="512" height="512" fill="#fff"/>
    <circle cx="256" cy="256" r="34" fill="#000"/></mask><g mask="url(#m)">${s}</g></svg>`
}

const OUT = new URL('../../client/public/', import.meta.url)
mkdirSync(new URL('icons/', OUT), { recursive: true })
writeFileSync(new URL('favicon.svg', OUT), icon())

const browser = await chromium.launch({ executablePath: process.env.GNDJ_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' })
const page = await browser.newPage()
async function png(svg, size, file) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<html><body style="margin:0;background:transparent">
    <img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`)
  await page.waitForFunction(() => document.images[0].complete)
  await page.screenshot({ path: new URL(file, OUT).pathname.replace(/^\/([A-Za-z]:)/, '$1'), omitBackground: true })
}
await png(icon(), 192, 'icons/app-192.png')
await png(icon(), 512, 'icons/app-512.png')
await png(icon({ rounded: false, scale: 0.82 }), 512, 'icons/app-maskable-512.png')
await png(icon({ rounded: false, scale: 0.92 }), 180, 'apple-touch-icon.png')
await png(badge(), 96, 'icons/badge-96.png')
await browser.close()
console.log('icons written to client/public')
