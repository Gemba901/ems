# Phase 3 implementation report

Implemented for review, 29 October 2026. **Status: In review.** Human review and merge remain pending.

## Delivered

Four templates live in `apps/web/components/templates/`:

- **ListPageTemplate** composes PageHeader and DataTable, including the table's existing FilterBar. Optional content can appear before/after the table without duplicating filter state.
- **DetailPageTemplate** composes PageHeader, central StatusBadge, a main-content slot and optional DetailList/Timeline/custom side panel. The sidebar stacks after the main content on mobile and uses a 2:1 desktop layout; absent sidebar content leaves a full-width main column.
- **FormPageTemplate** owns a labelled native form, FormSection groups, page-level errors and sticky FormActions. Pending/disabled state guards submission events as well as the button. Modules own validation, persistence and safe user-facing errors.
- **DashboardPageTemplate** composes PageHeader, responsive StatCard and ChartCard grids, optional module sections and loading/error/empty states. Individual charts retain their own partial-load/error APIs and accessible data alternatives.

`components/dev/template-showcase.tsx` demonstrates all four with Tickets fixtures in `/dev/ui`. A list action selects a detail record; the form demonstrates invalid/valid submission, pending actions and cancellation; the dashboard demonstrates metrics/chart data. No real records are written and production modules are unchanged.

[Conventions](conventions.md#phase-3-page-templates) now include an example and API/ownership guidance for every template. The [HTML walkthrough](phase-1-explained.html) includes a visual templates slide and still totals **30 minutes**, now across ten sections. The roadmap records the implementation as In review.

## Verification

- Jest/React Testing Library: **21/21 tests passed across five suites** (16 existing pattern tests plus five template tests). Template coverage checks one filter owner and list actions, detail status/sidebar/history and sidebar omission, single native form ownership, submit/cancel separation, sticky footer classes, pending/disabled submit guards, page-level errors and dashboard data/loading/error/retry/empty states.
- Full web TypeScript (`tsc --noEmit`) and scoped ESLint passed.
- Static presentation checks passed: ten slides, unique IDs and agenda allocations totaling 30 minutes.
- Chrome passed list search and list-to-detail navigation; desktop sidebar placement and mobile stacking; invalid/valid form submission and cancellation; computed sticky positioning and viewport containment of the footer on a long form; dashboard chart data; light/dark themes and all four layouts at 390px without horizontal page overflow. No browser page exceptions occurred.
- Offline presentation navigation and mobile layout passed. Screenshots were visually reviewed for detail and form layouts.
- Documentation links resolve and `git diff --check` passed.

Run `pnpm --filter web test:ui-kit` for all 21 pattern/template tests, or `pnpm --filter web test:ui-templates` for the five template tests. No dependencies were added for this phase.

## Scope and limits

The surrounding app shell supplies page padding; templates handle internal spacing. Shared template code does not import module services or permission rules. Client callbacks/render functions must originate in a client module. Detail content may compose server-rendered sections. The installed Next.js client-boundary guide was reviewed before implementation.

ListPageTemplate retains DataTable's complete-client-collection contract; server pagination is not inferred. FormPageTemplate does not replace caller/backend validation or idempotency. Sticky actions must be checked in the consumer's actual scroll container and with custom composite controls/mobile keyboards. Automated desktop/mobile viewport checks are not physical-device keyboard testing.

Phase 4 enforcement and Phase 5 production migration remain future work. This phase does not modify backend routes, database schemas or production module pages. Production build and whole-repository lint were not rerun; earlier phase results are historical. Browser checks use the existing local font-response fixture because Google Font downloads are unreliable in this environment.
