// Camp BP scoring rules — the client mirror of Application/Camps/CampScoring.cs, used to show which rounds are
// played and preview the points while a score is being entered. The server always recomputes on save.
//   • Two rounds of 50 (winner 50, tie 25/25). 5 esprit points split between the two familles.
//   • Lateness: on time vs A → round 1 given (50) to the on-time famille, only round 2 played (50);
//     on time vs B → 100 to the on-time famille; A vs A → only round 2, played for 100; A vs B → 100 to A; B vs B → 0.
//   • Énigme: winner of the rounds; tie → the famille that arrived first complete (the less late one when their
//     lateness differs); never a famille in retard B.
import type { CampLateness, CampSide } from '@/services/camp-service'

export interface RoundsPlan { fixedA: number; fixedB: number; manche1: number | null; manche2: number | null }

export function roundsPlan(a: CampLateness, b: CampLateness): RoundsPlan {
  const key = `${a}|${b}`
  switch (key) {
    case 'none|none': return { fixedA: 0, fixedB: 0, manche1: 50, manche2: 50 }
    case 'none|A': return { fixedA: 50, fixedB: 0, manche1: null, manche2: 50 }
    case 'A|none': return { fixedA: 0, fixedB: 50, manche1: null, manche2: 50 }
    case 'none|B': return { fixedA: 100, fixedB: 0, manche1: null, manche2: null }
    case 'B|none': return { fixedA: 0, fixedB: 100, manche1: null, manche2: null }
    case 'A|A': return { fixedA: 0, fixedB: 0, manche1: null, manche2: 100 }
    case 'A|B': return { fixedA: 100, fixedB: 0, manche1: null, manche2: null }
    case 'B|A': return { fixedA: 0, fixedB: 100, manche1: null, manche2: null }
    default: return { fixedA: 0, fixedB: 0, manche1: null, manche2: null } // B vs B
  }
}

// 'A' | 'B' when one famille was less late (so it arrived first), null when equally late.
export function firstByLateness(a: CampLateness, b: CampLateness): 'A' | 'B' | null {
  const rank = (r: CampLateness) => (r === 'A' ? 1 : r === 'B' ? 2 : 0)
  return rank(a) === rank(b) ? null : rank(a) < rank(b) ? 'A' : 'B'
}

export interface ScorePreview { pointsA: number; pointsB: number; enigme: 'A' | 'B' | null; needsFirstArrived: boolean; missing: string | null }

export function previewScore(i: { retardA: CampLateness; retardB: CampLateness; manche1: CampSide | null; manche2: CampSide | null; espritA: number | null; firstArrived: 'A' | 'B' | null }): ScorePreview {
  const plan = roundsPlan(i.retardA, i.retardB)
  let pa = plan.fixedA, pb = plan.fixedB
  let missing: string | null = null
  const add = (side: CampSide | null, stake: number | null, label: string) => {
    if (stake == null) return
    if (!side) { missing ??= `Résultat de la ${label}`; return }
    if (side === 'A') pa += stake
    else if (side === 'B') pb += stake
    else { pa += stake / 2; pb += stake / 2 }
  }
  add(i.manche1, plan.manche1, 'manche 1')
  add(i.manche2, plan.manche2, 'manche 2')
  if (i.espritA == null) missing ??= "Points d'esprit"
  const aCan = i.retardA !== 'B', bCan = i.retardB !== 'B'
  let enigme: 'A' | 'B' | null = null
  let needsFirstArrived = false
  if (pa > pb) enigme = aCan ? 'A' : null
  else if (pb > pa) enigme = bCan ? 'B' : null
  else if (aCan || bCan) {
    const first = firstByLateness(i.retardA, i.retardB) ?? i.firstArrived
    needsFirstArrived = firstByLateness(i.retardA, i.retardB) == null
    if (!first) missing ??= 'Famille arrivée en premier (égalité)'
    else enigme = first === 'A' ? (aCan ? 'A' : null) : (bCan ? 'B' : null)
  }
  return { pointsA: pa, pointsB: pb, enigme, needsFirstArrived, missing }
}

export const LATENESS_LABELS: Record<CampLateness, string> = { none: "À l'heure", A: 'Retard A', B: 'Retard B' }

// 'HH:mm:ss' → '11h30' (camp times).
export const hhmm = (t: string | null) => (t ? t.slice(0, 5).replace(':', 'h') : '')
