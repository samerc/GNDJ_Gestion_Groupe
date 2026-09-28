// Builds the Camp BP carte: a clean, modern plan of the Collège Notre-Dame de Jamhour grounds (no pins, no
// names on purpose — the commission adds what it needs). Traced from a Google Maps satellite view, north up
// (the old architect's plan in the BP archive is turned about 180°). Coordinates are in the screenshot's
// 1542×1025 space. Writes client/public/camp/carte-jamhour.svg; with --preview also writes PNGs next to this
// file (the plan, and the plan laid over the reference screenshot to check the tracing).
// Run from the repo root:  node tools/camp-map/build.mjs [--preview <reference.png>]
import { createRequire } from 'module'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
const require = createRequire(new URL('../../tests/e2e/package.json', import.meta.url))

const W = 1542, H = 1025
const C = {
  land: '#eef2e6', outside: '#e4e8de', forest: '#b9d7a4', forestEdge: '#9cc487', trees: '#8fbb78',
  building: '#f7f3ec', buildingEdge: '#8a8f99', roofShade: '#e3ded4', paved: '#dfdcd4', pavedEdge: '#c8c4ba',
  road: '#ffffff', roadEdge: '#c9cdd3', hwy: '#fbe7a6', hwyEdge: '#e2c46a',
  track: '#d97a5b', trackLine: '#f3c3b1', field: '#9fd18b', fieldLine: '#e9f6e1',
  court: '#7fbf8a', courtRed: '#d98b6c', courtLine: '#f4faf2', church: '#f1e6d2', churchEdge: '#9b8f78',
  garden: '#c9e3b5', parking: '#d6d8dc', text: '#3b4252',
}

const path = (d, fill, stroke = 'none', sw = 0, extra = '') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`
// Smooth open/closed curve through points (Catmull-Rom → cubic Bézier).
function curve(pts, closed = false) {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]]
  let d = `M${p[1][0]},${p[1][1]}`
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1.map(v => v.toFixed(1))} ${c2.map(v => v.toFixed(1))} ${p2[0]},${p2[1]}`
  }
  return closed ? d + 'Z' : d
}
const poly = pts => 'M' + pts.map(p => p.join(',')).join(' L') + 'Z'
// A road: white fill over a slightly wider grey edge.
const road = (pts, w = 16) => path(curve(pts), 'none', C.roadEdge, w + 4) + path(curve(pts), 'none', C.road, w)
const roadTop = (pts, w = 16) => path(curve(pts), 'none', C.road, w)
// A building with a soft drop shadow.
const bld = (d, fill = C.building) => path(d, 'rgba(40,50,60,.18)', 'none', 0, 'transform="translate(4,5)"') + path(d, fill, C.buildingEdge, 1.6)
const rect = (x, y, w, h, r = 3) => `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - 2 * r} a${r},${r} 0 0 1 -${r},-${r} v-${h - 2 * r} a${r},${r} 0 0 1 ${r},-${r}Z`

// Scattered tree crowns inside a region (deterministic), for texture on the forest.
function treeDots(xs, ys, n, seed, inside) {
  let s = seed, out = ''
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < n; i++) {
    const x = xs[0] + rnd() * (xs[1] - xs[0]), y = ys[0] + rnd() * (ys[1] - ys[0])
    if (inside && !inside(x, y)) continue
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(7 + rnd() * 7).toFixed(1)}" fill="${C.trees}" opacity=".55"/>`
  }
  return out
}

function svg() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter, Segoe UI, sans-serif">`
  s += `<rect width="${W}" height="${H}" fill="${C.outside}"/>`

  // Campus land (inside the ring of roads).
  const campus = [[30, 395], [160, 420], [300, 470], [480, 490], [700, 505], [850, 470], [900, 330], [880, 215], [1000, 212],
    [1150, 258], [1300, 320], [1345, 385], [1330, 420], [1200, 460], [1165, 520], [1170, 860], [1000, 900], [800, 905],
    [600, 900], [420, 880], [250, 860], [140, 790], [70, 640]]
  s += path(curve(campus, true), C.land)

  // Forest: the big wooded slope north of the school + the western and southern belts.
  const forestN = [[180, 110], [420, 60], [700, 70], [870, 160], [1020, 215], [1170, 262], [1300, 322], [1340, 390], [1250, 440],
    [1170, 470], [1050, 455], [960, 470], [830, 490], [700, 505], [520, 490], [380, 455], [250, 420], [200, 300]]
  s += path(curve(forestN, true), C.forest, C.forestEdge, 2)
  const forestW = [[40, 420], [150, 440], [260, 520], [320, 620], [300, 700], [330, 820], [260, 860], [150, 800], [80, 650]]
  s += path(curve(forestW, true), C.forest, C.forestEdge, 2)
  const forestS = [[470, 880], [700, 895], [900, 880], [1000, 905], [980, 960], [700, 990], [500, 960]]
  s += path(curve(forestS, true), C.forest, C.forestEdge, 2)
  s += treeDots([200, 1330], [80, 480], 420, 7, (x, y) => y > 60 + (x < 700 ? 0 : (x - 700) * 0.28) && y < 470 && !(x > 280 && x < 780 && y > 110 && y < 290))
  s += treeDots([60, 320], [440, 840], 120, 11)

  // Roads.
  // Outer ring: west road down to the south-west, north road, inner ring east + south.
  s += road([[0, 330], [30, 390], [60, 520], [80, 650], [140, 790], [240, 870], [340, 950], [450, 1025]], 18)
  s += road([[380, 0], [560, 30], [720, 70], [880, 150], [1000, 185], [1150, 225], [1260, 262], [1330, 300]], 16)
  s += road([[845, 212], [1000, 212], [1150, 245], [1270, 295], [1335, 350], [1335, 400], [1260, 440], [1190, 470], [1163, 530], [1160, 700], [1175, 855]], 16)
  s += road([[1000, 910], [1100, 875], [1200, 860], [1320, 865], [1450, 860], [1542, 850]], 16)
  s += road([[30, 390], [160, 420], [250, 480], [330, 560], [420, 620], [500, 660]], 14)
  s += road([[160, 420], [280, 460], [500, 495]], 12)
  s += road([[250, 480], [230, 520], [260, 560]], 8)
  s += road([[760, 190], [880, 150]], 10)
  s += road([[1160, 760], [1015, 760]], 10)
  s += road([[1340, 380], [1420, 410], [1542, 360]], 14)

  // Beirut–Damascus highway (with the Louaizé interchange loop).
  const hwy = [[860, 0], [960, 70], [1080, 140], [1220, 190], [1310, 250], [1380, 340], [1430, 470], [1470, 620], [1500, 780], [1525, 920], [1542, 1000]]
  s += path(curve(hwy), 'none', C.hwyEdge, 34) + path(curve(hwy), 'none', C.hwy, 28)
  const ramp = [[1090, 120], [1180, 160], [1240, 150], [1265, 110], [1230, 70], [1200, 60]]
  s += path(curve(ramp), 'none', C.hwyEdge, 16) + path(curve(ramp), 'none', C.hwy, 12)
  s += path(curve([[1265, 150], [1300, 230], [1330, 300]]), 'none', C.hwyEdge, 14) + path(curve([[1265, 150], [1300, 230], [1330, 300]]), 'none', C.hwy, 10)

  // Paved yards / esplanade around the main school.
  s += path(poly([[330, 700], [470, 690], [480, 790], [345, 800]]), C.paved, C.pavedEdge, 1.5)
  s += path(poly([[470, 780], [860, 775], [860, 880], [620, 890], [500, 870]]), C.paved, C.pavedEdge, 1.5)
  s += path(poly([[390, 555], [470, 540], [520, 600], [520, 690], [420, 690]]), C.paved, C.pavedEdge, 1.5)

  // Petit collège CNDJ (north, in the forest clearing). Traced from a closer satellite view (its own pixel space,
  // mapped onto the main map with pc(), anchored on the white hall at the west end).
  const pc = pts => pts.map(([x, y]) => [+(300 + (x - 60) * 0.34).toFixed(1), +(152 + (y - 265) * 0.345).toFixed(1)])
  const pcPoly = pts => poly(pc(pts))
  s += path(curve(pc([[40, 250], [300, 230], [520, 150], [900, 160], [1200, 250], [1420, 300], [1420, 560], [1330, 640], [1000, 650], [600, 630], [300, 470], [60, 420]]), true), C.paved, C.pavedEdge, 1.2)
  s += bld(pcPoly([[95, 260], [252, 300], [228, 405], [60, 370]]))                                     // white hall
  s += `<path d="${pcPoly([[90, 300], [240, 335]]).replace('Z', '')}" stroke="${C.roofShade}" stroke-width="3"/>`
  s += bld(pcPoly([[320, 265], [415, 280], [405, 410], [310, 400]]))                                   // small block
  s += bld(pcPoly([[430, 300], [520, 305], [530, 340], [570, 345], [575, 470], [415, 465]]))           // stepped block
  s += bld(pcPoly([[510, 265], [615, 270], [612, 325], [505, 320]]))
  s += bld(pcPoly([[640, 185], [930, 240], [915, 345], [630, 320]]))                                   // north wing (solar roof)
  for (let i = 0; i < 4; i++) s += `<path d="${pcPoly([[680, 215 + i * 28], [900, 255 + i * 28]]).replace('Z', '')}" stroke="#aeb7c6" stroke-width="3"/>`
  // Covered sports courts in the courtyard (green courts under a purple roof band).
  s += path(pcPoly([[620, 318], [910, 350], [900, 500], [615, 470]]), C.court, C.pavedEdge, 1.2)
  s += path(pcPoly([[710, 330], [790, 338], [775, 485], [700, 478]]), '#b9a6d8', '#9a86bf', 1)
  s += bld(pcPoly([[590, 470], [865, 510], [860, 610], [585, 590]]))                                   // south block
  s += bld(pcPoly([[855, 500], [990, 510], [980, 630], [855, 615]]))                                   // link
  s += bld(pcPoly([[935, 245], [1180, 275], [1175, 355], [930, 340]]))                                 // north-east block
  s += bld(pcPoly([[1035, 320], [1180, 335], [1178, 385], [1030, 375]]))
  s += bld(pcPoly([[960, 380], [1300, 420], [1295, 545], [930, 520]]))                                 // east wing (solar roof)
  for (let i = 0; i < 3; i++) s += `<path d="${pcPoly([[1125, 420 + i * 35], [1285, 440 + i * 35]]).replace('Z', '')}" stroke="#aeb7c6" stroke-width="3"/>`
  s += bld(pcPoly([[1215, 630], [1375, 640], [1370, 705], [1210, 698]]))                               // small building below

  // Collège Notre-Dame de Jamhour: the long L of buildings around the church courtyard.
  s += path(poly([[545, 560], [700, 555], [705, 760], [560, 760]]), C.garden, C.pavedEdge, 1)
  s += bld(poly([[520, 520], [715, 530], [715, 572], [520, 560]]))
  s += bld(poly([[700, 555], [748, 555], [752, 770], [704, 770]]))
  s += bld(poly([[530, 770], [760, 770], [760, 820], [530, 820]]))
  s += bld(rect(752, 725, 110, 45))
  s += bld(rect(398, 548, 38, 50))
  s += bld(rect(725, 520, 60, 35))
  // Church: round nave with its ribbed roof.
  s += `<circle cx="620" cy="700" r="60" fill="rgba(40,50,60,.18)" transform="translate(4,5)"/>`
  s += `<circle cx="620" cy="700" r="60" fill="${C.church}" stroke="${C.churchEdge}" stroke-width="1.8"/>`
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    s += `<line x1="620" y1="700" x2="${(620 + 58 * Math.cos(a)).toFixed(1)}" y2="${(700 + 58 * Math.sin(a)).toFixed(1)}" stroke="${C.churchEdge}" stroke-width=".8" opacity=".55"/>`
  }
  s += `<circle cx="620" cy="700" r="9" fill="${C.churchEdge}"/>`

  // Sports hall + the buildings east of it.
  s += bld(rect(830, 485, 128, 155))
  s += `<path d="M836,562 H952" stroke="${C.roofShade}" stroke-width="4"/>`
  s += bld(rect(965, 460, 72, 100), C.roofShade)
  for (let y = 475; y < 555; y += 16) s += `<line x1="970" y1="${y}" x2="1032" y2="${y}" stroke="#c9c3b6" stroke-width="2"/>`
  s += bld(rect(1015, 545, 118, 75))
  s += bld(rect(1040, 470, 60, 45))

  // Parking + red multisport court.
  s += path(rect(1000, 645, 145, 90, 4), C.parking, C.pavedEdge, 1.2)
  for (let x = 1012; x < 1140; x += 14) s += `<line x1="${x}" y1="652" x2="${x}" y2="680" stroke="#fff" stroke-width="1.5"/><line x1="${x}" y1="700" x2="${x}" y2="728" stroke="#fff" stroke-width="1.5"/>`
  s += path(rect(965, 655, 32, 78, 2), C.courtRed, C.pavedEdge, 1)

  // Green courts (south) + the building next to them.
  s += path(rect(835, 780, 170, 72, 3), C.court, C.pavedEdge, 1.2)
  for (const x of [880, 925, 965]) s += `<line x1="${x}" y1="786" x2="${x}" y2="846" stroke="${C.courtLine}" stroke-width="2"/>`
  s += bld(rect(1025, 780, 95, 70))
  s += bld(rect(1125, 775, 45, 40))

  // Stadium: running track around the football pitch.
  s += `<rect x="1183" y="488" width="228" height="350" rx="100" fill="${C.track}" stroke="#b9644a" stroke-width="2"/>`
  for (const inset of [8, 16]) s += `<rect x="${1183 + inset}" y="${488 + inset}" width="${228 - 2 * inset}" height="${350 - 2 * inset}" rx="${100 - inset}" fill="none" stroke="${C.trackLine}" stroke-width="1.3"/>`
  s += `<rect x="1207" y="512" width="180" height="302" rx="78" fill="${C.field}"/>`
  s += `<rect x="1225" y="545" width="144" height="236" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/>`
  s += `<line x1="1225" y1="663" x2="1369" y2="663" stroke="${C.fieldLine}" stroke-width="2.5"/>`
  s += `<circle cx="1297" cy="663" r="22" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/>`
  s += `<rect x="1267" y="545" width="60" height="26" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/><rect x="1267" y="755" width="60" height="26" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/>`

  // North arrow + scale-free title band.
  s += `<g transform="translate(70,90)"><circle r="34" fill="#fff" stroke="${C.text}" stroke-width="2" opacity=".92"/><path d="M0,-24 L9,8 L0,2 L-9,8Z" fill="${C.text}"/><text y="26" text-anchor="middle" font-size="16" font-weight="700" fill="${C.text}">N</text></g>`
  s += '</svg>'
  return s
}

const out = svg()
mkdirSync(new URL('../../client/public/camp/', import.meta.url), { recursive: true })
writeFileSync(new URL('../../client/public/camp/carte-jamhour.svg', import.meta.url), out)
console.log('wrote client/public/camp/carte-jamhour.svg')

const i = process.argv.indexOf('--preview')
if (i > 0) {
  const { chromium } = require('playwright-core')
  const b = await chromium.launch({ channel: 'msedge' })
  const p = await b.newPage({ viewport: { width: W, height: H } })
  await p.setContent(`<body style="margin:0">${out}</body>`)
  await p.screenshot({ path: new URL('./preview.png', import.meta.url).pathname.slice(1) })
  const ref = readFileSync(process.argv[i + 1]).toString('base64')
  await p.setContent(`<body style="margin:0;position:relative"><img src="data:image/png;base64,${ref}" style="position:absolute;width:${W}px;height:${H}px"/><div style="position:absolute;opacity:.55">${out}</div></body>`)
  await p.screenshot({ path: new URL('./overlay.png', import.meta.url).pathname.slice(1) })
  await b.close()
  console.log('wrote preview.png + overlay.png')
}
