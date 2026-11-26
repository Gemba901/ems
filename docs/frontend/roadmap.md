# Frontend Consistency Roadmap

**Owner:** Rodgers Munene (frontend owner, shared kit, enforcement)
**Started:** 2026-10-26
**Diagram:** [frontend-roadmap.excalidraw](frontend-roadmap.excalidraw). Open it at excalidraw.com or with the VS Code Excalidraw extension.

## Why

The backend stays consistent because NestJS gives every module the same shape: module, controller, service, DTO. The frontend has nothing like that. Each developer builds their own module's UI, so every module ends up with its own buttons, tables, modals, page headers and colours.

### Baseline (2026-10-26)

| Module  | Hand-written `<button>` | Uses `ui/button` | Hand-written `<table>` | Hand-rolled modals | Hex colours | Raw Tailwind palette classes |
| ------- | ----------------------- | ---------------- | ---------------------- | ------------------ | ----------- | ---------------------------- |
| steel   | 36                      | 57 files         | 24                     | 11                 | 26          | 1,640                        |
| dwms    | 120                     | 0                | 5                      | 5                  | 28          | 1,531                        |
| sga     | 70                      | 0                | 1                      | 0                  | 30          | 1,051                        |
| sims    | 38                      | 0                | 3                      | 1                  | 67          | 933                          |
| five-s  | 81                      | 0                | 5                      | 0                  | 41          | 564                          |
| kaizen  | 35                      | 0                | 1                      | 0                  | 20          | 560                          |
| leave   | 32                      | 0                | 1                      | 0                  | 1           | 538                          |
| work    | 80                      | 0                | 3                      | 2                  | 16          | 496                          |
| tickets | 3                       | 0                | 0                      | 0                  | 0           | 106                          |

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

- [x] `PageHeader`: title, description, breadcrumb, actions slot
- [x] `PageSection` / `SectionCard`: titled content block
- [x] `StatCard`: KPI tile with value, label, trend and icon
- [x] `DataTable`: columns, sorting, search, filters, pagination, row actions, loading, empty and error states
- [x] `FilterBar`: search, select filters, date range and reset
- [x] `StatusBadge`: reads from `lib/status.ts`
- [x] `EmptyState`, `LoadingState`, `ErrorState`
- [x] `ConfirmDialog`: destructive and confirm actions
- [x] `FormField` / `FormSection` / `FormActions`
- [x] `DetailList`: label/value pairs for detail pages
- [x] `ChartCard`: a Recharts wrapper that uses the `chart-*` tokens
- [x] `Timeline` / `ActivityFeed`: for approval history, which SIMS, SGA and Kaizen all have
- [x] Add each one to `/dev/ui`, plus Jest and RTL tests for the behaviour-heavy ones (`DataTable`, `ConfirmDialog`, `FormField`).

**Exit:** every pattern is in `/dev/ui` with tests, and the patterns cover the list, detail, form and dashboard needs of the pilot module.

**Implementation:** see [pattern guide](phase-2-patterns.md) and [verification report](phase-2-report.md). Tickets fixture compositions cover list, detail, form and dashboard needs in `/dev/ui`; production migration remains Phase 5.

### Phase 3: Page templates (M)

The goal is to stop every module laying out its pages differently.

- [x] `ListPageTemplate`: PageHeader + FilterBar + DataTable
- [x] `DetailPageTemplate`: PageHeader + status + main column + side panel (DetailList, Timeline)
- [x] `FormPageTemplate`: PageHeader + FormSections + sticky FormActions
- [x] `DashboardPageTemplate`: PageHeader + StatCard row + ChartCard grid
- [x] Document each template in `conventions.md` with a code example.

**Exit:** a new module page can be built using only a template, patterns and module logic.

**Implementation:** all four templates have live Tickets fixture examples in `/dev/ui`, documented APIs/examples in [conventions](conventions.md#phase-3-page-templates), and behaviour tests. See the [Phase 3 report](phase-3-report.md). Production modules migrate in Phase 5.

### Phase 4: Enforcement (M)

The goal is to make the rules automatic instead of relying on reminders.

- [x] Scoped ESLint warnings for native controls, hard-coded colours, raw Tailwind palettes, fixed overlays and cross-module component imports.
- [x] UI drift report and committed baseline grouped by module and rule.
- [x] GitHub Actions check for pull requests and merge queues.
- [x] PR template and frontend-kit guidance in `apps/web/CLAUDE.md`.
- [x] CODEOWNERS entries for the shared kit, design tokens and enforcement configuration.

Run `pnpm --filter web ui:drift` to print current counts, and add `--check`
to validate the committed baseline. After removing violations, add `--write`
to record the lower counts and commit the baseline with the cleanup. CI
compares the proposed baseline with the target branch's baseline, so raising
the proposed counts cannot accommodate regressions. For the initial rollout,
CI checks the proposed baseline against the scan.

**Exit:** Make `UI drift` a required check and enable required code owner
reviews in the protected branch rules. GitHub must recognise the CODEOWNERS
account as having write access.

### Phase 5: Module migration (L, rolling)

Migrate the modules in scope onto the kit in the order below. Leave and Steel Manufacturing are outside this rollout.

| Order | Module | Status |
| --- | --- | --- |
| 1 | Tickets | All four screens migrated locally. Zero tracked Tickets UI violations and strict lint enabled. Browser verification pending. |
| 2 | RTM (`dwms`) | In progress. RTM naming and seven core screens migrated locally. Alerts, abnormalities, action creation, activities, ingestion, settings, and documentation screens remain. |
| 3 | Small Group Activities (`sga`) | Migrated locally. Zero tracked UI violations and strict SGA lint enabled. |
| 4 | SIMS | Migrated locally. Strict SIMS lint enabled. Browser verification pending. |
| 5 | Daily Gemba Kaizen | Migrated locally. Overview, detail, HOD review, creation wizard, implementation, verification, All Kaizens, and Reports. Browser verification pending. |
| 6 | 5S Workplace | All 20 screens migrated locally. Zero tracked UI violations and strict 5S lint enabled. Browser verification pending. |
| 7 | Team Workspace | Pending. Migrate attendance and analytics views. |
| 8 | Dashboard, HR, EMS, Admin, Settings, Reports, Calendar | Pending. Migrate shared pages and shell. |

SGA now uses the kit across the overview, detail and review flow, creation
wizard, All SGAs, and Reports. Shared native selects preserve grouped options
and native keyboard behaviour. Reports retain the existing calculations.
Chromium checks with simulated API responses covered filters, report scope
and date selection, draft creation, HOD return and retry, and mobile
resubmission.

SIMS uses the kit across the overview, submission, detail and review flow,
lists, review queue, committee report, settings and Analytics. Local tests
covered role-based submission and review, anonymous author display, filters,
queue retry, and monthly spreadsheet export. Browser verification is pending.

The previous Tickets and RTM migration changes were local to a temporary
worktree that is no longer available. Phase 4 (`9cfdcd8`) and the current
SGA work are available in the durable frontend-kit worktree. The Tickets migration has been reapplied. The core RTM screens have been reapplied. Complete the remaining RTM screens before considering Phase 5 complete.

Checklist for each module:

- [ ] Swap primitives (buttons, inputs, tables, modals) for kit components.
- [ ] Swap colours for tokens, and statuses for `StatusBadge`.
- [ ] Rebuild pages on templates.
- [ ] Take before and after screenshots and attach them to the PR.
- [ ] Lower the module's number in `ui-drift-baseline.json`, and switch its lint rules from `warn` to `error` once it reaches 0.

**Exit:** every module in scope has zero drift. Leave and Steel Manufacturing remain covered by the baseline.

### Phase 6: Lock-in and maintenance (ongoing)

- [ ] Enforce UI lint as errors for migrated modules. Keep baseline enforcement for Leave and Steel Manufacturing.
- [ ] Remove unused legacy helpers from migrated modules.
- [ ] Optional: dark mode (tokens make it a CSS-only change) and Playwright visual regression on `/dev/ui`.
- [ ] Keep a kit changelog in `docs/frontend/kit-changelog.md`, and hold a short monthly review of requests from module developers.

---

## Tracking

| Phase          | Status      | Notes                                                                                                                                                                |
| -------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundations | In review   | Implementation complete: conventions, tokens/scales/icons, central status map and reserved folders. Awaiting team review and merge; see [report](phase-0-report.md). |
| 1. Primitives  | In review   | Kit and showcase implemented; see [Phase 1 report](phase-1-report.md) for verification and owner decisions.                                                          |
| 2. Patterns    | In review   | Pattern kit, Tickets fixture compositions and behaviour tests implemented; see [report](phase-2-report.md).                                                          |
| 3. Templates   | In review   | Four templates implemented with fixture examples, documentation and tests; see [report](phase-3-report.md).                                                          |
| 4. Enforcement | In review   | Rules, baseline, CI and ownership files implemented. Required check and review settings pending.                                                                                             |
| 5. Migration   | In progress | SGA, SIMS, Daily Gemba Kaizen, and 5S Workplace migrated locally. All Tickets screens migrated locally. RTM core screens migrated locally. Remaining RTM screens are pending.                                                                                                                                                                      |
| 6. Lock-in     | Not started |                                                                                                                                                                      |
