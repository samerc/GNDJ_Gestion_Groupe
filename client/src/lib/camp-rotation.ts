// Camp BP rotation — which famille counts can get a grand-jeu rotation. Mirrors CampRotationGrid.Problem on the
// server (G games for 2 × G familles; 2 or 3 games are mathematically impossible; up to 50 games).
export const MAX_ROTATION_GAMES = 50

export function rotationProblem(familles: number): string | null {
  if (!Number.isFinite(familles) || familles < 2) return 'Il faut au moins 2 familles pour la rotation.'
  if (familles % 2 !== 0) return 'La rotation demande un nombre pair de familles (2 par jeu).'
  const games = familles / 2
  if (games === 2 || games === 3) return `Aucune rotation n'est possible avec ${familles} familles : choisissez au moins 8 familles.`
  if (games > MAX_ROTATION_GAMES) return `La rotation va jusqu'à ${MAX_ROTATION_GAMES * 2} familles.`
  return null
}
