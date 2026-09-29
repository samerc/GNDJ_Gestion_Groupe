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
// Roads are collected and drawn edges-first, tops-second (flushRoads), so where two roads meet the grey edge of
// one never shows across the white of the other.
let roadList = []
const road = (pts, w = 16) => { roadList.push([pts, w]); return '' }
const flushRoads = () => {
  const out = roadList.map(([p, w]) => path(curve(p), 'none', C.roadEdge, w + 4)).join('') + roadList.map(([p, w]) => path(curve(p), 'none', C.road, w)).join('')
  roadList = []
  return out
}
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
  // Tree areas: between the upper road and the road down to the cour; between the sports hall and the red court.
  for (const pts of [[[268, 484], [330, 490], [400, 502], [396, 532], [372, 566], [330, 556], [290, 522]],
    [[832, 648], [900, 642], [958, 650], [958, 740], [900, 752], [836, 746]]]) {
    s += path(curve(pts, true), C.forest, C.forestEdge, 1.5)
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    s += treeDots([Math.min(...xs) + 12, Math.max(...xs) - 12], [Math.min(...ys) + 12, Math.max(...ys) - 12], 22, xs[0] + ys[0])
  }
  // More greenery (commission): west of the Petit collège, and between the forest and the road below it.
  for (const pts of [[[190, 100], [150, 170], [110, 260], [88, 340], [92, 392], [160, 408], [214, 405], [215, 300], [196, 200]],
    [[520, 486], [640, 500], [740, 518], [800, 545], [790, 575], [740, 552], [650, 532], [520, 505]]]) {
    s += path(curve(pts, true), C.forest)
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    s += treeDots([Math.min(...xs) + 10, Math.max(...xs) - 10], [Math.min(...ys) + 8, Math.max(...ys) - 8], 30, xs[1] + ys[1])
  }
  // Small cleared area above the vaulted building (no trees, no building).
  s += path(curve([[950, 472], [985, 440], [1030, 426], [1080, 436], [1110, 458], [1050, 470]], true), C.land)

  // Roads.
  // Outer ring: west road down to the south-west, north road, inner ring east + south.
  s += road([[0, 330], [30, 390], [60, 520], [80, 650], [140, 790], [240, 870], [340, 950], [450, 1025]], 18)
  s += road([[380, 0], [560, 30], [720, 70], [880, 150], [1000, 185], [1150, 225], [1260, 262], [1330, 300]], 16)
  s += road([[762, 210], [845, 212], [1000, 212], [1150, 245], [1270, 295], [1335, 350], [1335, 400], [1260, 440], [1190, 470], [1163, 530], [1160, 700], [1175, 855]], 16)
  s += road([[30, 390], [160, 420], [252, 452], [330, 472], [420, 487]], 12)
  // road from the upper road down to the Cour de la Vierge (cars drive into the cour)
  s += road([[252, 452], [250, 484], [272, 518], [305, 552], [338, 578], [372, 600], [420, 626], [456, 650], [466, 680], [488, 712], [525, 736], [562, 750], [600, 760]], 12)
  s += road([[250, 480], [230, 520], [260, 560]], 8)
  s += road([[760, 190], [880, 150]], 10)

  // Campus roads added from the commission's corrections:
  // west road around the open court, then along the south of the college;
  s += road([[259, 563], [273, 599], [285, 638], [292, 677], [308, 731], [331, 778], [366, 813], [413, 835], [452, 846], [511, 862], [569, 874], [647, 879], [698, 878]], 12)
  // road between the forest and the college, then down past the sports hall to the courts;
  s += road([[420, 487], [500, 499], [560, 516], [650, 538], [715, 548], [765, 568], [797, 596], [814, 640], [818, 700], [826, 738], [848, 760], [880, 770], [918, 771]], 12)
  // road above the tennis courts to the east road.
  s += road([[835, 787], [880, 778], [930, 773], [1000, 766], [1080, 766], [1165, 768]], 10)
  // road at the forest edge above the vaulted building, down to the east road.
  s += road([[940, 480], [942, 446], [972, 436], [1030, 442], [1075, 455], [1120, 470], [1150, 484], [1178, 497]], 9)
  s += flushRoads()
  // Stairway between the Petit collège and the Grand collège (steps across a narrow flight).
  {
    const top = [686, 298], bottom = [664, 530], n = 26
    s += `<path d="M${top} L${bottom}" stroke="#d8d2c4" stroke-width="12" stroke-linecap="round"/>`
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = top[0] + (bottom[0] - top[0]) * t, y = top[1] + (bottom[1] - top[1]) * t
      s += `<line x1="${(x - 6).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + 6).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#a79f8c" stroke-width="1.4"/>`
    }
  }

  // Beirut–Damascus highway (with the Louaizé interchange loop).
  const hwy = [[860, 0], [960, 70], [1080, 140], [1220, 190], [1310, 250], [1380, 340], [1430, 470], [1470, 620], [1500, 780], [1525, 920], [1542, 1000]]
  s += path(curve(hwy), 'none', C.hwyEdge, 34) + path(curve(hwy), 'none', C.hwy, 28)
  const ramp = [[1090, 120], [1180, 160], [1240, 150], [1265, 110], [1230, 70], [1200, 60]]
  s += path(curve(ramp), 'none', C.hwyEdge, 16) + path(curve(ramp), 'none', C.hwy, 12)
  s += path(curve([[1265, 150], [1300, 230], [1330, 300]]), 'none', C.hwyEdge, 14) + path(curve([[1265, 150], [1300, 230], [1330, 300]]), 'none', C.hwy, 10)

  // Paved yards / esplanade around the main school.
  s += path(poly([[470, 780], [860, 775], [860, 880], [620, 890], [500, 870]]), C.paved, C.pavedEdge, 1.5)
  // Bus parking just north of the préau (a few buses parked side by side).
  {
    const a = [352, 680], b = [462, 716], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
    let g = `<rect x="0" y="-14" width="${L.toFixed(1)}" height="28" rx="4" fill="${C.parking}" stroke="${C.pavedEdge}" stroke-width="1.2"/>`
    for (let i = 0; i < 6; i++) g += `<rect x="${12 + i * 16}" y="-11" width="10" height="22" rx="2" fill="#f4c542" stroke="#b58d1c" stroke-width=".9"/><rect x="${13.5 + i * 16}" y="-9" width="7" height="4" rx="1" fill="#7e93a8"/>`
    s += `<g transform="translate(${a}) rotate(${ang.toFixed(1)})">${g}</g>`
  }
  // Préau west of the college: a big flat building whose roof is a parking (roof drawn as parking with bays).
  {
    const A = [345, 700], B = [468, 740], C2 = [452, 810], D = [328, 773]
    s += bld(poly([A, B, C2, D]), C.parking)
    for (let i = 1; i < 12; i++) {
      const t = i / 12
      const top = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], bot = [D[0] + (C2[0] - D[0]) * t, D[1] + (C2[1] - D[1]) * t]
      const m = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
      for (const [k0, k1] of [[0.06, 0.4], [0.6, 0.94]]) {
        const p0 = m(top, bot, k0), p1 = m(top, bot, k1)
        s += `<line x1="${p0[0].toFixed(1)}" y1="${p0[1].toFixed(1)}" x2="${p1[0].toFixed(1)}" y2="${p1[1].toFixed(1)}" stroke="#fff" stroke-width="1.4"/>`
      }
    }
  }
  s += path(poly([[390, 555], [470, 540], [520, 600], [520, 690], [420, 690]]), C.paved, C.pavedEdge, 1.5)

  // Petit collège CNDJ (north, in the forest clearing). Traced from a closer satellite view (its own pixel space,
  // mapped onto the main map with pc(), anchored on the white hall at the west end).
  const pc = pts => pts.map(([x, y]) => [+(300 + (x - 60) * 0.34).toFixed(1), +(152 + (y - 265) * 0.345).toFixed(1)])
  const pcPoly = pts => poly(pc(pts))
  s += path(curve(pc([[40, 250], [300, 230], [520, 150], [900, 160], [1200, 250], [1420, 300], [1420, 560], [1330, 640], [1000, 650], [600, 630], [300, 470], [60, 420]]), true), C.paved, C.pavedEdge, 1.2)
  // The buildings share one grid, turned ~6° clockwise like on the photo: drawn as straight rectangles in that
  // grid (x0, y0, x1, y1 in close-up pixels) and rotated as a group, so their edges line up.
  const PC_ROT = 6, [pcx, pcy] = pc([[700, 420]])[0]
  const pr = (x0, y0, x1, y1) => { const [[a, b], [c, d]] = pc([[x0, y0], [x1, y1]]); return rect(a, b, c - a, d - b, 2) }
  let g = ''
  g += bld(pr(75, 339, 240, 439))                                   // white hall
  g += `<path d="${pr(85, 372, 230, 376)}" fill="${C.roofShade}"/>`
  g += bld(pr(315, 312, 410, 440))                                  // small block
  g += bld(pr(420, 322, 570, 486))                                  // block by the courts
  g += bld(pr(510, 272, 612, 318))
  g += bld(pr(630, 203, 925, 318))                                  // north wing (solar roof)
  for (let i = 0; i < 4; i++) g += `<path d="${pr(670, 222 + i * 24, 890, 225 + i * 24)}" fill="#aeb7c6"/>`
  g += path(pr(620, 322, 905, 478), C.court, C.pavedEdge, 1.2)     // covered courts in the courtyard
  g += path(pr(710, 322, 785, 478), '#b9a6d8', '#9a86bf', 1)
  g += bld(pr(590, 487, 860, 597))                                  // south block
  g += bld(pr(860, 487, 985, 597))                                  // link
  g += bld(pr(935, 223, 1175, 305))                                 // north-east block
  g += bld(pr(1035, 305, 1178, 340))
  g += bld(pr(935, 356, 1300, 488))                                 // east wing (solar roof)
  for (let i = 0; i < 3; i++) g += `<path d="${pr(1125, 380 + i * 32, 1285, 383 + i * 32)}" fill="#aeb7c6"/>`
  g += bld(pr(1215, 573, 1372, 640))                                // small building below
  s += `<g transform="rotate(${PC_ROT} ${pcx} ${pcy})">${g}</g>`

  // Collège Notre-Dame de Jamhour, traced from a close-up satellite view (its own pixel space, mapped onto the main
  // map with cm(), anchored on the church): the Jesuit fathers' wing (north), the long solar-roofed wing (east), the
  // south wing, the church with its garden, and the Cour de la Vierge between the church and the south wing.
  const cm = pts => pts.map(([x, y]) => [+(620 + (x - 932) * 0.467).toFixed(1), +(700 + (y - 458) * 0.467).toFixed(1)])
  const cmPoly = pts => poly(cm(pts))
  const cmRect = (x0, y0, x1, y1) => { const [[p, q], [r, t]] = cm([[x0, y0], [x1, y1]]); return rect(p, q, r - p, t - q, 2) }
  // Garden around the church (lawn + trees), then the paved square east of the church.
  s += path(curve(cm([[650, 300], [760, 245], [1050, 285], [1085, 380], [1080, 540], [880, 545], [700, 470], [640, 390]]), true), C.garden, C.forestEdge, 1)
  s += treeDots(cm([[660, 0]])[0].concat(cm([[1050, 0]])[0]).filter((_, i) => i % 2 === 0), [cm([[0, 270]])[0][1], cm([[0, 400]])[0][1]], 40, 5,
    (x, y) => Math.hypot(x - 620, y - 700) > 52)
  s += path(cmRect(1015, 390, 1088, 535), C.paved, C.pavedEdge, 1)
  // Cour de la Vierge (road-coloured: cars drive in): the court between the church and the south wing, with the statue in the middle.
  s += path(curve(cm([[868, 592], [905, 560], [990, 552], [1082, 562], [1086, 628], [985, 634], [892, 624]]), true), C.road, C.roadEdge, 2)
  const [vx, vy] = cm([[985, 594]])[0]
  s += `<circle cx="${vx}" cy="${vy}" r="6" fill="#dbe7f3" stroke="#6d86a6" stroke-width="1.5"/><circle cx="${vx}" cy="${vy}" r="2" fill="#6d86a6"/>`
  // Jesuit fathers' wing (north), slanting down to the east, with the small house at its west end.
  s += bld(cmPoly([[755, 158], [1105, 212], [1110, 272], [1060, 272], [755, 222]]))
  for (let i = 0; i < 2; i++) s += `<path d="M${cm([[820, 178 + i * 22]])[0]} L${cm([[1060, 215 + i * 22]])[0]}" stroke="#aeb7c6" stroke-width="2.5"/>`
  s += bld(cmRect(690, 158, 752, 198), '#f3d9c8')
  s += bld(cmPoly([[1120, 76], [1265, 96], [1260, 141], [1115, 126]]))
  // East wing: the long solar-roofed building running south, then the entrance block.
  s += bld(cmRect(1088, 225, 1180, 552))
  for (let i = 0; i < 9; i++) s += `<path d="M${cm([[1100, 250 + i * 32]])[0]} L${cm([[1168, 250 + i * 32]])[0]}" stroke="#aeb7c6" stroke-width="2"/>`
  s += bld(cmRect(1098, 552, 1160, 700))
  // Local Clan building (east of the entrance) + the small blocks south of the south wing.
  s += bld(cmRect(1160, 548, 1410, 640))
  for (let i = 0; i < 2; i++) s += `<path d="M${cm([[1200, 575 + i * 30]])[0]} L${cm([[1395, 575 + i * 30]])[0]}" stroke="#aeb7c6" stroke-width="2"/>`
  // South wing (solar roof) and the blocks along its south side.
  s += bld(cmRect(752, 645, 1100, 725))
  for (let i = 0; i < 2; i++) s += `<path d="M${cm([[785, 668 + i * 30]])[0]} L${cm([[1085, 668 + i * 30]])[0]}" stroke="#aeb7c6" stroke-width="2"/>`
  for (const [x0, x1] of [[742, 785], [915, 965], [1100, 1148]]) s += bld(cmRect(x0, 725, x1, 800))
  // Church: round nave with its ribbed roof.
  const [ccx, ccy] = cm([[932, 458]])[0], cr = 100 * 0.467
  s += `<circle cx="${ccx}" cy="${ccy}" r="${cr}" fill="rgba(40,50,60,.18)" transform="translate(4,5)"/>`
  s += `<circle cx="${ccx}" cy="${ccy}" r="${cr}" fill="${C.church}" stroke="${C.churchEdge}" stroke-width="1.8"/>`
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    s += `<line x1="${ccx}" y1="${ccy}" x2="${(ccx + (cr - 2) * Math.cos(a)).toFixed(1)}" y2="${(ccy + (cr - 2) * Math.sin(a)).toFixed(1)}" stroke="${C.churchEdge}" stroke-width=".8" opacity=".55"/>`
  }
  s += `<circle cx="${ccx}" cy="${ccy}" r="7" fill="${C.churchEdge}"/>`

  // East side (sports hall → stadium), traced from a close-up satellite view mapped onto the main map with ce(),
  // anchored on the stadium track and the sports hall.
  const ce = pts => pts.map(([x, y]) => [+(1183 + (x - 822) * 0.503).toFixed(1), +(488 + (y - 95) * 0.497).toFixed(1)])
  const cePoly = pts => poly(ce(pts))
  const ceRect = (x0, y0, x1, y1, r = 2) => { const [[p, q], [u, v]] = ce([[x0, y0], [x1, y1]]); return rect(p, q, u - p, v - q, r) }
  const ceLine = (pts, color, w) => `<path d="M${ce(pts).map(p => p.join(',')).join(' L')}" stroke="${color}" stroke-width="${w}" fill="none"/>`
  // Sports hall: dark upper roof, light main roof, flat lower part.
  s += bld(ceRect(120, 95, 365, 395))
  s += path(ceRect(140, 108, 352, 180, 1), '#dcd8cf')
  s += ceLine([[135, 300], [360, 300]], C.buildingEdge, 1.2)
  // Vaulted building (four barrel roofs) and the lawn east of it.
  s += bld(ceRect(393, 50, 525, 215), C.roofShade)
  for (let i = 1; i < 4; i++) s += ceLine([[398, 50 + i * 41], [520, 50 + i * 41]], '#c9c3b6', 2)
  s += path(ceRect(528, 70, 665, 210, 3), C.garden, C.forestEdge, 1)
  // Building block with rooftop equipment.
  s += bld(cePoly([[380, 215], [550, 215], [550, 262], [735, 262], [735, 282], [720, 282], [720, 365], [500, 365], [500, 300], [380, 300]]))
  for (const [x, y] of [[420, 235], [460, 235], [560, 300], [610, 320], [660, 300]]) s += path(ceRect(x, y, x + 28, y + 22, 1), '#e4e0d8', C.buildingEdge, .8)
  // Red multisport court + parking.
  s += path(ceRect(385, 432, 455, 590), C.courtRed, C.pavedEdge, 1)
  s += path(ceRect(458, 420, 742, 600, 3), C.parking, C.pavedEdge, 1.2)
  for (const row of [[430, 470], [500, 545], [555, 595]]) for (let x = 470; x < 735; x += 16)
    s += ceLine([[x, row[0]], [x, row[1]]], '#fff', 1.4)
  // The courts and the buildings south of the parking.
  // Four courts side by side (north-south): two green ones on the west, two clay-coloured ones on the east.
  for (let i = 0; i < 4; i++) {
    const x0 = 145 + i * 79.25, x1 = x0 + 77, fill = i < 2 ? C.court : '#dcc9a6'
    s += path(ceRect(x0, 680, x1, 842, 2), fill, C.pavedEdge, 1.2)
    s += path(ceRect(x0 + 10, 698, x1 - 10, 824, 1), 'none', C.courtLine, 1.4)
    s += ceLine([[x0 + 10, 761], [x1 - 10, 761]], C.courtLine, 2)
  }
  s += bld(ceRect(500, 690, 700, 822))
  s += path(ceRect(555, 715, 665, 800, 1), '#ffffff', C.buildingEdge, .8)
  s += bld(ceRect(700, 668, 800, 738))
  s += bld(ceRect(845, 690, 895, 765))
  // Stand along the west side of the pitch.
  s += bld(ceRect(806, 420, 858, 568), '#f0c9a3')

  // Stadium: running track around the football pitch.
  s += `<rect x="1183" y="488" width="228" height="350" rx="100" fill="${C.track}" stroke="#b9644a" stroke-width="2"/>`
  for (const inset of [8, 16]) s += `<rect x="${1183 + inset}" y="${488 + inset}" width="${228 - 2 * inset}" height="${350 - 2 * inset}" rx="${100 - inset}" fill="none" stroke="${C.trackLine}" stroke-width="1.3"/>`
  s += `<rect x="1207" y="512" width="180" height="302" rx="78" fill="${C.field}"/>`
  s += `<rect x="1225" y="545" width="144" height="236" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/>`
  s += `<line x1="1225" y1="663" x2="1369" y2="663" stroke="${C.fieldLine}" stroke-width="2.5"/>`
  s += `<circle cx="1297" cy="663" r="22" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/>`
  s += `<rect x="1267" y="545" width="60" height="26" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/><rect x="1267" y="755" width="60" height="26" fill="none" stroke="${C.fieldLine}" stroke-width="2.5"/>`

  // School gates: a bar across the road with two posts.
  for (const [x, y, ang] of [[858, 146, 27], [52, 394, 13]]) {
    s += `<g transform="translate(${x},${y}) rotate(${ang + 90})"><rect x="-13" y="-2" width="26" height="4" rx="1.5" fill="#5b6472"/><rect x="-16" y="-4" width="5" height="8" rx="1" fill="#3b4252"/><rect x="11" y="-4" width="5" height="8" rx="1" fill="#3b4252"/></g>`
  }
  // Cemetery: a small square with a cross.
  s += `<rect x="636" y="932" width="26" height="26" rx="2" fill="#ece8df" stroke="#8a8f99" stroke-width="1.4"/><path d="M649,937 V953 M643,942 H655" stroke="#3b4252" stroke-width="2.2" stroke-linecap="round"/>`

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
