# GNDJ — Design System & Conventions

The app's visual language. Read this before building or restyling any authenticated page so the UI stays
consistent. Identity: **navy primary + turquoise accent**, Inter, crisp borders on a white canvas, cards that
float via a soft shadow. Do NOT restyle the public site (`pages/public/*`) or the auth/portal screens
(`login`, `forgot-*`, `reset-password`, `pages/inscription/*`) with these conventions — they are a separate,
intentionally richer/centered tier.

## Tokens (client/src/index.css)

Never hand-pick raw palette colors (`bg-amber-500`, `text-red-600`, `bg-[#...]`). Use semantic tokens so light
+ dark both work:

- Surfaces: `bg-background` (white canvas), `bg-card` (white, floats), `bg-muted` / `bg-muted/40` (tint).
- Text: `text-foreground`, `text-muted-foreground`.
- Borders: `border-border` (card/divider), `border-input` (form fields — darker/crisper).
- Brand: `bg-primary` / `text-primary` (navy), `bg-accent` / `text-accent` (turquoise), `ring-ring`.
- **Status families** (each has a solid, an on-solid `-foreground`, a tinted `-subtle` surface, and a `-border`):
  - success (green), warning (amber), info (blue), destructive/danger (red).
  - Solid: `bg-success text-success-foreground`. Soft label/banner: `bg-success-subtle text-success border-success-border`.

## Primitives (components/ui)

- **Button** — 36px default (`h-9`), `sm` = 32px, `lg` = 40px, `icon` = `h-9 w-9`. Variants: default / outline /
  secondary / ghost / destructive / link. Leading icon: `<Icon className="mr-1.5 h-4 w-4" />` (use `mr-1.5`).
- **Input / Select** — 36px, one shared soft focus ring + accent-tinted hover. Prefer `<SearchInput>` for search.
- **Card** — `rounded-xl`, crisp border, soft `shadow-card`, padding 20px. `CardTitle` = 18px semibold.
- **Badge** — status variants: `success` / `warning` / `info` / `danger` (soft tinted), plus default / secondary
  / destructive (solid) / outline. Use these instead of `<Badge className="bg-green-600">`.
- **Dialog / Sheet / Dropdown / Tooltip** — one elevated shadow, dim overlay (no blur).

## Shared scaffold (components/shared) — use on every authenticated page

- **`<PageHeader title description? icon? actions? />`** — the standard page title block: accent icon tile +
  title + subtitle + right-aligned actions + a hairline divider. Replaces every hand-rolled
  `<div className="flex justify-between"><h1 className="text-2xl font-bold">…</h1>…</div>` header.
- **`<Page size?>`** — page body wrapper: `space-y-6` rhythm + optional width (`full` default / `wide` = max-w-5xl
  / `narrow` = max-w-3xl for member-facing/reading pages). The app shell already pads — pages must NOT re-pad.
- **`<SearchInput value onChange placeholder? />`** — standard search field (magnifier + clear button).
- **`<SegmentedToggle options value onChange size? />`** — Actifs/Anciens-style segmented control.
- **`<Callout tone icon? title? >children</Callout>`** — tinted status banner (info/success/warning/danger/muted).
  Replaces hand-rolled `bg-amber-50 border-amber-200 …` notice boxes.
- **`<EmptyState icon title description? action? />`** — the one empty-state (already exists). Use it instead of
  ad-hoc `<p className="text-center text-muted-foreground py-12">Aucun …</p>`.
- **`<LoadingSpinner variant="table|cards|page|form|detail|profile|spinner" />`** — pick the variant that matches
  the page's eventual layout; never leave a bare `<LoadingSpinner />` as the primary page load.

## Page conversion recipe

Before:
```tsx
return (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold">Titre</h1>
      <Button onClick={…}><Plus className="mr-2 h-4 w-4" />Nouveau</Button>
    </div>
    <div className="relative max-w-sm">
      <Search className="absolute left-3 …" />
      <Input placeholder="Rechercher..." value={q} onChange={e=>setQ(e.target.value)} className="pl-9" />
    </div>
    …
  </div>
)
```
After:
```tsx
return (
  <Page>
    <PageHeader title="Titre" icon={SomeIcon}
      actions={<Button onClick={…}><Plus className="mr-1.5 h-4 w-4" />Nouveau</Button>} />
    <SearchInput value={q} onChange={setQ} placeholder="Rechercher..." className="max-w-sm" />
    …
  </Page>
)
```

Rules:
- Keep `<Page>` `size="full"` for data/admin pages; `narrow` only for member-facing reading pages (my-*).
- A page rendered BOTH standalone and embedded in Settings (has an `embedded` prop) shows `<PageHeader>` only
  when `!embedded`; when embedded, keep just the actions row (e.g. `<div className="flex justify-end">…</div>`).
- Convert obvious status colors to Badge variants / Callout / status tokens as you touch a page (e.g.
  `<Badge className="bg-green-600">Actif</Badge>` → `<Badge variant="success">`). Don't force every color.
- Swap ad-hoc empty `<p>` → `<EmptyState>`, and bare `<LoadingSpinner/>` → the matching `variant`.
- Remove now-unused imports (e.g. `Search`, `X`, `Input` if the SearchInput replaced them and they're unused).
- NEVER change business logic, data flow, permissions, or props. This is a visual/structure pass only.
- Do not touch full-height "app-within-page" layouts (members list, unit-leader dashboard) beyond adopting
  PageHeader/tokens if it's safe — preserve their internal scroll structure.
