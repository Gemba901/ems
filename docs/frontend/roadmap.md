# Frontend Consistency Roadmap

**Owner:** Rodgers Munene (frontend owner, shared kit, enforcement)
**Started:** 2026-10-26
**Diagram:** [frontend-roadmap.excalidraw](frontend-roadmap.excalidraw). Open it at excalidraw.com or with the VS Code Excalidraw extension.

## Why

The backend stays consistent because NestJS gives every module the same shape: module, controller, service, DTO. The frontend has nothing like that. Each developer builds their own module's UI, so every module ends up with its own buttons, tables, modals, page headers and colours.

### Baseline (2026-10-26)

| Module | Hand-written `<button>` | Uses `ui/button` | Hand-written `<table>` | Hand-rolled modals | Hex colours | Raw Tailwind palette classes |
|---|---|---|---|---|---|---|
| steel | 36 | 57 files | 24 | 11 | 26 | 1,640 |
| dwms | 120 | 0 | 5 | 5 | 28 | 1,531 |
| sga | 70 | 0 | 1 | 0 | 30 | 1,051 |
| sims | 38 | 0 | 3 | 1 | 67 | 933 |
| five-s | 81 | 0 | 5 | 0 | 41 | 564 |
| kaizen | 35 | 0 | 1 | 0 | 20 | 560 |
| leave | 32 | 0 | 1 | 0 | 1 | 538 |
| work | 80 | 0 | 3 | 2 | 16 | 496 |
| tickets | 3 | 0 | 0 | 0 | 0 | 106 |

What already exists:
- `components/ui/` has shadcn (`base-nova` style) `Button`, `Card`, `Badge`, `Input`, `Popover`, `Tooltip`, `Progress` and `Avatar`. Only Steel uses them.
- `app/globals.css` defines brand tokens (`gemba-navy`, `gemba-lime`, `gemba-red`) and shadcn semantic tokens (`primary`, `muted`, `destructive`, `chart-1..5`).
- `components/shell/ModuleSidebar.tsx` is the shared module navigation.
- `lib/steelStatusColors.ts` is a status colour map that only Steel uses.

## How the frontend will be built

Every module page is assembled from five layers. Each layer may only use the layers below it.

```
 Module pages        app/<module>/**, components/<module>/**   ← module developers
 ─────────────────────────────────────────────────────────────
 Page templates      components/templates/                     ← frontend owner
 Patterns            components/patterns/                      ← frontend owner
 Primitives          components/ui/                            ← frontend owner (shadcn)
 Design tokens       app/globals.css, lib/status.ts            ← frontend owner
```

- **Tokens:** colours, status colours, radius, type scale and spacing. They are the only place a colour value is written.
- **Primitives:** shadcn components with no business logic, such as Button, Input, Dialog and Table.
- **Patterns:** composed building blocks that every module repeats, such as PageHeader, DataTable, StatusBadge and EmptyState.
- **Templates:** whole page layouts: list, detail, form and dashboard.
- **Module pages:** only business logic, data fetching and module-specific components, put together from the layers below.

**Enforcement** covers every layer: ESLint rules, a CI gate, a PR checklist, and the rules in `apps/web/CLAUDE.md` so AI-assisted code follows them too.

**Rule of thumb:** if a module needs something the kit doesn't have, the module developer asks the frontend owner. The owner either adds it to the kit or approves it as module-specific. Module developers don't build their own copy of a shared part.

---

## Phases

Sizes: **S** is a few days, **M** is about a week, **L** is two weeks or more, all part-time alongside feature work.

### Phase 0: Foundations and conventions (S)

The goal is to decide the rules before writing components.

- [x] Write `docs/frontend/conventions.md`:
  - folder rules (which layer goes where)
  - naming
  - how to request a kit component
  - "never write a colour value, use a token"
- [x] Complete the design tokens in `globals.css`:
  - semantic status tokens: `success`, `warning`, `info`, `danger`, `neutral`, each with `-foreground` and `-subtle`
  - confirm `primary` maps to the Gemba brand colours
- [x] Set the type scale (page title, section title, body, caption) and the spacing scale for page, section and card padding.
- [x] Create `lib/status.ts`. It holds one map from every status enum across modules (DRAFT, PENDING, APPROVED, REJECTED, IN_PROGRESS, CLOSED…) to a status tone. It replaces `steelStatusColors.ts`.
- [x] Fix icon rules: lucide only, with set sizes (`size-4` inline, `size-5` buttons, `size-6` headers).
- [x] Create the folders `components/patterns/` and `components/templates/`.

**Phase 1 prerequisite:** semantic status tokens were added early for the primitive kit, including light/dark values and contrast coverage. The remaining Phase 0 foundations are now implemented; see [conventions](conventions.md) and the [Phase 0 report](phase-0-report.md). Team review and merge are still pending.

**Exit:** the conventions doc is reviewed by the team, the tokens are merged, and `lib/status.ts` covers every module's status enums.

### Phase 1: Primitive kit (M)

The goal is to give every common HTML control a shared component.

- [x] Add shadcn primitives: `select`, `textarea`, `label`, `checkbox`, `radio-group`, `switch`, `dialog`, `alert-dialog`, `sheet`, `tabs`, `table`, `dropdown-menu`, `skeleton`, `separator`, `scroll-area`, `sonner` (toasts).
- [x] Check the existing `button`, `badge`, `card` and `input` against the new tokens. Add variants where modules need them (for example `Button` `size="icon"` and `Badge` status tones).
- [x] Add a `Form` wrapper built on `react-hook-form` and `zod`, since both are already dependencies.
- [x] Add a `/dev/ui` showcase route that renders every primitive with all its variants. It is gated so it is hidden in production.

**Exit:** no common control is missing from the kit, and every primitive appears in `/dev/ui`.

### Phase 2: Pattern kit (L)

The goal is to build the pieces that every module currently rebuilds. This phase removes most of the drift.

- [ ] `PageHeader`: title, description, breadcrumb, actions slot
- [ ] `PageSection` / `SectionCard`: titled content block
- [ ] `StatCard`: KPI tile with value, label, trend and icon
- [ ] `DataTable`: columns, sorting, search, filters, pagination, row actions, loading, empty and error states
- [ ] `FilterBar`: search, select filters, date range and reset
- [ ] `StatusBadge`: reads from `lib/status.ts`
- [ ] `EmptyState`, `LoadingState`, `ErrorState`
- [ ] `ConfirmDialog`: destructive and confirm actions
- [ ] `FormField` / `FormSection` / `FormActions`
- [ ] `DetailList`: label/value pairs for detail pages
- [ ] `ChartCard`: a Recharts wrapper that uses the `chart-*` tokens
- [ ] `Timeline` / `ActivityFeed`: for approval history, which SIMS, SGA and Kaizen all have
- [ ] Add each one to `/dev/ui`, plus Jest and RTL tests for the behaviour-heavy ones (`DataTable`, `ConfirmDialog`, `FormField`).

**Exit:** every pattern is in `/dev/ui` with tests, and the patterns cover the list, detail, form and dashboard needs of the pilot module.

### Phase 3: Page templates (M)

The goal is to stop every module laying out its pages differently.

- [ ] `ListPageTemplate`: PageHeader + FilterBar + DataTable
- [ ] `DetailPageTemplate`: PageHeader + status + main column + side panel (DetailList, Timeline)
- [ ] `FormPageTemplate`: PageHeader + FormSections + sticky FormActions
- [ ] `DashboardPageTemplate`: PageHeader + StatCard row + ChartCard grid
- [ ] Document each template in `conventions.md` with a code example.

**Exit:** a new module page can be built using only a template, patterns and module logic.

### Phase 4: Enforcement (M)

The goal is to make the rules automatic instead of relying on reminders.

- [ ] ESLint rules (`no-restricted-syntax`, scoped to `app/**` and `components/<module>/**`, excluding the kit folders):
  - raw `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>` → use the kit
  - hex colour literals in `className` / `style` → use tokens
  - raw Tailwind palette classes (`bg-blue-600`, `text-red-500`…) → use semantic tokens
  - hand-rolled modals (`fixed inset-0`) → use `Dialog` / `Sheet`
  - imports from another module's `components/<module>/` → move the part to the kit
- [ ] **Ratchet script** (`scripts/ui-drift-report`): counts violations per module and compares the counts with a committed `ui-drift-baseline.json`. CI fails if any module's count goes up, and the baseline is lowered as modules are migrated. New code must be clean, and old code isn't forced to change all at once.
- [ ] Add the lint and the ratchet to the CI gate.
- [ ] PR template checklist: "uses kit components / tokens / a page template; new shared needs requested from the frontend owner".
- [ ] Add the kit rules to `apps/web/CLAUDE.md` so AI-generated code follows them.
- [ ] Add a CODEOWNERS entry for `components/ui/`, `components/patterns/`, `components/templates/` and `app/globals.css` (frontend owner).

**Exit:** CI blocks any rise in drift, and kit folders need the owner's review.

### Phase 5: Module migration (L, rolling)

The goal is to move every module onto the kit, one module per PR series, alongside feature work.

| Order | Module | Why this order |
|---|---|---|
| 1 | tickets | Smallest (5 files). Pilot to test the kit, fix gaps in it before scaling. |
| 2 | leave | Small and shows how forms and lists work in the kit. |
| 3 | dwms | Highest drift (120 raw buttons, 1.5k palette classes). |
| 4 | sga | High drift; shares approval patterns with SIMS and Kaizen. |
| 5 | sims | Uses the most hex colours; approval and timeline heavy. |
| 6 | kaizen | Reuses the SGA/SIMS patterns. |
| 7 | five-s | Audit tables and forms. |
| 8 | work | Attendance and analytics dashboards; tests `DashboardPageTemplate`. |
| 9 | steel | Already uses the primitives; mostly swapping to the patterns and `lib/status.ts`. |
| 10 | dashboard, hr, ems, admin, settings, reports, calendar | Shared and shell pages. |

Checklist for each module:
- [ ] Swap primitives (buttons, inputs, tables, modals) for kit components.
- [ ] Swap colours for tokens, and statuses for `StatusBadge`.
- [ ] Rebuild pages on templates.
- [ ] Take before and after screenshots and attach them to the PR.
- [ ] Lower the module's number in `ui-drift-baseline.json`, and switch its lint rules from `warn` to `error` once it reaches 0.

**Exit:** every module's drift count is 0.

### Phase 6: Lock-in and maintenance (ongoing)

- [ ] Turn all UI lint rules to `error` across the app and delete the ratchet baseline.
- [ ] Remove the legacy helpers (`steelStatusColors.ts` and any module-local copies of kit parts).
- [ ] Optional: dark mode (tokens make it a CSS-only change) and Playwright visual regression on `/dev/ui`.
- [ ] Keep a kit changelog in `docs/frontend/kit-changelog.md`, and hold a short monthly review of requests from module developers.

---

## Tracking

| Phase | Status | Notes |
|---|---|---|
| 0. Foundations | In review | Implementation complete: conventions, tokens/scales/icons, central status map and reserved folders. Awaiting team review and merge; see [report](phase-0-report.md). |
| 1. Primitives | In review | Kit and showcase implemented; see [Phase 1 report](phase-1-report.md) for verification and owner decisions. |
| 2. Patterns | Not started | |
| 3. Templates | Not started | |
| 4. Enforcement | Not started | Phase 4 can start in parallel with Phase 2 as lint rules in `warn` mode. |
| 5. Migration | Not started | |
| 6. Lock-in | Not started | |
