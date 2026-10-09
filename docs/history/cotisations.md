# Cotisations

Payments, currencies, full-payment rules, dashboards, association dues.

Build diary moved out of CLAUDE.md on 2026-10-09 (text unchanged, oldest first). Append new work at the end.

### CU test follow-ups: cotisation scoping + unit stats + passage re-edit (2026-07-10)
From the CU shakedown. Three fixes:
- **Cotisation summary scoped to the caller's units.** `GetCotisationSummaryQuery` was group-wide (any
  `cotisations.view` holder — i.e. every CU — got the whole group's totals + per-unit breakdown). Now it filters
  active assignments to `currentUser.AuthorizedUnitIds` for non-super-admins: a **CU sees only their unit(s)**
  (verified: 86 members / just "Compagnie 1" vs super-admin's 1077 / 18 units); a **Chef de Groupe** still sees
  everything (login grants all units to a group-level holder); super-admin bypasses. The `/admin/cotisations`
  route (CG group dashboard) was also re-gated from `COTISATIONS_VIEW` → **`MAITRISE_MANAGE`** (CG-only), so a CU
  can't reach the group page at all.
- **CU per-unit cotisation stats** added to the unit-documents page (`unit-documents.tsx`): a compact bar computed
  CLIENT-SIDE from the already-loaded matrix (no extra call) — "N payées · M en attente · K exemptées · sur T ·
  Total encaissé …". Gives the CU their own numbers without any group data.
- **CU can change a passage line until the CG FINALIZES it.** The backend already re-proposed Pending/Approved
  lines (updates in place), but the passage page only showed a status badge once a line existed — no way to change
  an auto-approved "Pas de changement". Added a **"Modifier"** toggle (`passage.tsx`): an editable line
  (Pending/Approved, i.e. not Finalized/Rejected) shows badge + Modifier → re-reveals the Pas de changement /
  Proposer / Quitte actions (+ Annuler). Verified: no-change → re-propose "quitte" updates the SAME line
  (1 row, now Pending). DEV until deploy.

### CG cotisation dashboard — actionable unpaid list (2026-07-25)
The `/admin/cotisations` "Membres sans cotisation" list was a flat alphabetical **name + unit** table —
nothing to act on, so useless for actually chasing payments. Reworked into a follow-up worklist:
- **Backend** (`GetUnpaidCotisationsQuery`/`UnpaidCotisationDto`): now carries `UnitId` + a resolved
  follow-up **contact** — `ParentName`, `ContactEmail`, `ContactPhone` — via a batched `UnpaidContactResolver`
  (member's PrimaryContactEmail → own primary/first → guardian; phone own→guardian; parent = primary-contact
  guardian first). One-pass, no N+1. Ordered by unit → name. CG-only (members.edit gate) so contact is fine.
- **Frontend** (`cotisation-dashboard.tsx`): **grouped by unit** (per-unit count), each row shows the parent +
  clickable **mailto:/tel:** links; **member name → opens the member file** (`/members/:id`); inline
  **"Paiement"** (compact single-line record-payment dialog → `useCreateCotisation`, auto receipt#) and
  **"Ne paiera pas"** (exempt → `useSetCotisationExempt`), both refreshing the unpaid+summary queries;
  **Exporter (CSV)** (client-side, UTF-8 BOM for Excel) + **Imprimer** (new `@media print` isolation in
  index.css — `.print-area` shows alone, `.no-print` hidden).
- Verified live: 1073 unpaid returned with parent/email/phone resolved + unit grouping. Build + tsc + eslint
  clean. DEV until deploy.

### Cotisation — « Dû aux associations » report + maîtrise-doesn't-pay toggle (2026-09-03)
Completed the cotisation-per-association work (prior session added only the input settings). All on main, DEV
until deploy; verified live end-to-end.
- **New setting `cotisation.maitrise_pays`** (boolean, default true, category cotisations, auto-seeds via
      SeedMissingSettings). A single global toggle "La maîtrise paie une cotisation". When OFF: maîtrise members
      (any active `FunctionalRole.IsMaitrise` role) drop off the "à relancer"/impayés lists (counted as exempt in
      the summary), the association-dues maîtrise line goes to 0, and their Ma fiche hides the cotisation. The
      per-member "ne paiera pas" flag still works independently (for when the maîtrise DOES owe but one chef is
      exempt).
- **`GET /cotisations/association-dues?scoutYear=`** (`GetAssociationDuesQuery`, gated `maitrise.manage` — CG-only
      internal figure). Per association: `amountPerMember` (from `cotisation.association_amounts`) × distinct YOUTH
      members whose active unit belongs to that association, with two counts — ALL members vs those who PAID (≥1
      payment line). **Maîtrise is a SEPARATE line** at `cotisation.maitrise_amount` (never mixed into an
      association total); `pays=false` zeroes it. A member is "maîtrise" if ANY active role is IsMaitrise (excluded
      from youth association counts). Scoped to the caller's units like the summary (CG holds all).
- **Frontend:** new "Dû aux associations" card on `/admin/cotisations` (`cotisation-dashboard.tsx`) — a
      Tous/Membres-ayant-payé segmented toggle + a table (Association · cotisation/membre · membres · total dû) +
      Maîtrise row ("ne paie pas cette année" when off) + grand total. `MeResponse.IsMaitrise` added (via GetMeQuery)
      so `MemberCotisations` (with a new `selfView` prop, set only from `/my-documents`) hides the "cotisation
      attendue" banner for a maîtrise member when `cotisation.maitrise_pays=false`.
- **Verified live:** dues math (GDL 12×513=6156, SDL 10×496=4960 [paid 3×10=30], Maîtrise 25×71=1775); toggling
      maîtrise off → unpaid 1076→1005 (71 maîtrise dropped), summary exempt 1→72, dues maîtrise line → 0; settings
      restored to defaults. Build clean (dotnet 0/0, tsc + eslint). Migration-free; setting seeds on prod startup.

### Cotisations — full-payment tracking per currency + equivalent total (2026-09-16)
A CG asks: with a $30 fee, families often pay in LBP (or a mix) — how do we know who paid IN FULL, and see the
amounts? Two additions (all on main, DEV until deploy; migration-free — new setting seeds on prod startup):
- **Model = PROPORTION PER CURRENCY.** New setting **`cotisation.full_amounts`** (json `{"USD":30,"LBP":2500000}`,
  category cotisations, seeds via SeedMissingSettings; empty `{}` = feature off → any payment counts as paid, old
  behaviour). Each payment counts as a fraction of ITS OWN currency's full price, summed: $15 = 50%, 1 250 000 LBP
  = 50%, both = 100% (full); **paying exactly 2 500 000 LBP = full regardless of the exchange rate** (the LBP price
  is set on its own, not derived from USD × rate). A currency with no full price falls back to converting to the
  reference via the rate. Shared `Application/Common/CotisationCalc.cs` (`Config`/`LoadAsync`/`Fraction`/
  `EquivalentInReference`/`Evaluate` → status Paid/Partial/Unpaid/Exempt + percent + remaining-in-reference); used
  by every cotisation read (member tab, summary, unpaid, paid) so the status is authoritative server-side.
- **Amounts stay stored in the currency actually paid** (2 600 000 LBP is stored as LBP, never converted). The
  dashboard shows per-currency totals PLUS a converted **"≈ $X équivalent"** (reference currency, via exchange rate)
  when >1 currency. The receipt PDF's converted total was already there (`ReceiptService`).
- **3-state dashboard** (`cotisation-dashboard.tsx` + summary DTO): Payé en entier / **Partiel** / Impayé / Exempté;
  progress bar has an amber partial segment; per-unit table gained a Partiel column; the **"à relancer" list now
  includes partial payers** (status badge + % paid + "déjà payé X" + "reste ≈ $Y"). A partial row's action is
  **"Compléter"** → the member file (the inline create would reject a duplicate cotisation), unpaid rows keep the
  inline "Paiement"/"Ne paiera pas". Member tab + Ma fiche read the DTO status (dropped the old client-side
  convert-to-default guess). Payment dialogs show a "Cotisation pleine : $30 · 2 500 000 LBP" hint.
- Settings UI: new `FullAmountsEditor` (mirrors the exchange-rate row editor) for `cotisation.full_amounts`.
- **BUG FIXED (pre-existing, unrelated but on this path): editing ANY cotisation 409'd** ("Cette information vient
  d'être modifiée"). `UpdateCotisationCommandHandler` mutated the tracked parent's `.Payments` nav collection
  (Add/Remove) → spurious parent UPDATE → DbUpdateConcurrencyException (the documented multi-page-docs / sibling
  gotcha). Fixed: load the parent WITHOUT Include(Payments), load/replace lines via the `CotisationPayments` DbSet
  with the FK, never touch `entity.Payments`. So all cotisation edits (and the partial top-up flow) now work.
- Verified live end-to-end (throwaway cotisations, cleaned up + setting restored to `{}`): $15 → Partial 50% reste
  $15 (member DTO + summary partial count + unpaid row w/ paidTotals); mixed $15 + 1.25M LBP → Paid 100%
  (equivalent 28.97); exact 2.5M LBP → Paid 100% (rate-independent); edit 204 (was 409). dotnet 0/0 + tsc + eslint
  + vite clean.

### Cotisations — customizable currencies + payment UX (2026-09-17)
Follow-ups from a CG cotisation walkthrough (all on main, DEV until deploy; migration-free — reuses the existing
`cotisation.default_currency` + `cotisation.exchange_rates` settings). Three items:
- **Currencies are now fully customizable (no hardcoded USD/EUR/LBP).** The DEFINED currency list = the reference/
  default currency (rate 1) ∪ the exchange-rate map keys, edited together in ONE new **"Devises"** editor at the top
  of Paramètres → Cotisations (`CurrenciesEditor` in settings.tsx): add/remove a currency, ★-mark the default (its
  rate input is disabled = reference), set each other rate; self-persists BOTH settings on Save. `default_currency`
  + `exchange_rates` are hidden from the generic per-row rendering (HIDDEN_KEYS). Everything draws its currency list
  from this via the shared **`useCurrencies()`** hook (`hooks/use-currencies.ts`) + helpers in `lib/cotisation.ts`
  (`buildCurrencies`/`currencyLabel`/`parseMoneyMap`/`fullAmountFor`): the 3 payment dropdowns (cotisation-dashboard,
  member-cotisations, unit-documents) + the **"Montant de la cotisation (par devise)"** editor (rewritten to list one
  amount field per defined currency instead of free-typing codes). `formatMoney` shows the code for any currency it
  has no built-in symbol for (USD $ / EUR € / LBP ل.ل kept). Backend: the 2 cotisation validators now accept any
  `^[A-Za-z]{2,10}$` code (dropped `Currency.All`) so a custom currency validates — needs the end-of-batch rebuild.
- **Prefill amount on currency change (#1):** switching a payment line's currency re-fills the amount with the NEW
  currency's full price when it wasn't manually typed (blank, or still the OLD currency's full price) —
  `amountOnCurrencyChange` in lib/cotisation — so paying in LBP after a USD prefill no longer records "30 LBP".
- **Overpayment "trop-perçu" (#3):** a fully-paid cotisation over 100% shows the excess (equivalent − reference full)
  in the reference currency — member Cotisations banner + Ma fiche + the dashboard "Ont payé" list. The raw >100%
  percent is otherwise not surfaced.
- Cotisations settings tab reordered logically (PINNED_TOP): Devises card → Montant par devise → association
  amounts → maîtrise amount → maîtrise paie.
- **Per-currency SYMBOL (added same day):** new setting `cotisation.currency_symbols` (json `{"USD":"$","LBP":"ل.ل"}`,
  category cotisations, seeds via SeedMissingSettings + backend rebuild); a symbol column in the Devises editor
  (saves all 3 keys together). A runtime registry in `lib/utils.ts` (`setCurrencySymbols`/`currencySymbol`) feeds
  `formatMoney`; `components/shared/currency-symbols-sync.tsx` (mounted in AppLayout) loads the setting into it. A
  currency with no symbol shows its code.
- **Comma thousands separators on amount fields (added same day):** new `components/ui/amount-input.tsx`
  (`AmountInput` — text input, comma-grouped as you type e.g. 2,500,000, emits a plain number, caret preserved like
  PhoneInput) applied to the money fields (the 3 payment dialogs' amount, the Devises rate, "Montant par devise",
  association amounts). `formatMoney` switched fr-FR spaces → `en-US` grouping (commas + period decimals) so displays
  match the inputs. NOT applied to non-money number inputs (years/counts) — grouping a year is wrong. The generic
  Settings number widget (e.g. maîtrise_amount) is left unformatted.
- **EUR removed** from the dev DB's exchange rates + the seed default (fresh DBs); on PROD the existing
  `cotisation.exchange_rates` row keeps EUR until a CG removes it via the Devises editor (SeedMissingSettings never
  overwrites an existing row). One historical EUR payment line exists — it still displays; its equivalent now
  converts 1:1 (no rate).
- Verified live: custom currency "AED" payment accepted by the rebuilt backend (was rejected pre-rebuild), invalid
  code "12$" → 400; currency_symbols seeded on startup + PUT round-trip 204; tsc + eslint + vite + dotnet all clean.

### Cotisation dashboard "Par unité" redesign (2026-09-26, frontend-only, DEV until deploy)
- Replaced the expand-a-row table (opening a unit dropped a long list mid-table and hid the others) with
  master/detail in `cotisation-dashboard.tsx`: **unit tiles** (`UnitTile`: code, name, stacked bar payé/partiel/
  exempté, x/y payés, "n à relancer" / "À jour", amounts) + a "Toutes les unités" tile; on phones a single unit
  `Select` replaces the tiles. Below, ONE member list for the selected scope with tabs **À relancer / Ont payé /
  Exemptés** (counts) + accent-insensitive name search; own scroll area (max 65vh, full on print); unit shown per
  row when "Toutes". Same actions as before. Summary cards Payé / Impayés open the list on the matching tab.

