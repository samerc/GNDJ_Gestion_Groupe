import { useId } from 'react'

// A neckerchief (foulard) emblem: a downward triangle filled with the scarf's colours as vertical stripes
// (1 = solid, 2–3 = striped, e.g. the Clan's blue/orange/white), with a collar line + knot. Stripes are drawn
// as rects clipped to the triangle; the clip id is unique per instance so multiple glyphs on one page can't
// collide. Sizing comes from `className` (the SVG scales to it). A thin slate outline keeps pale/white scarves
// legible on light backgrounds.
export function FoulardGlyph({ colors, className }: { colors: string[]; className?: string }) {
  const outline = 'rgba(15,23,42,0.22)'
  const clipId = useId()
  const cols = colors.length ? colors : ['#94a3b8']
  const n = cols.length
  const left = 4, width = 20, stripe = width / n // triangle spans x=4..24
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}><path d="M4 8 H24 L14 24 Z" /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {cols.map((c, i) => (
          <rect key={i} x={left + i * stripe} y={8} width={stripe + 0.4} height={16} fill={c} />
        ))}
      </g>
      <path d="M4 8 H24 L14 24 Z" fill="none" stroke={outline} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M4 8 H24" stroke={outline} strokeWidth="1" strokeLinecap="round" />
      <circle cx="14" cy="8" r="2.6" fill="#fff" stroke={outline} strokeWidth="0.9" />
    </svg>
  )
}
