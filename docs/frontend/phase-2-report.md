# Phase 2 implementation report

Implemented 29 October 2026. **Status: In review.** Team review and merge remain pending.

## Delivered

The complete roadmap pattern set lives in `apps/web/components/patterns/`: PageHeader, PageSection/SectionCard, StatCard, DataTable, FilterBar, StatusBadge, EmptyState, LoadingState, ErrorState, ConfirmDialog, FormField/FormSection/FormActions, DetailList, ChartCard and Timeline/ActivityFeed. Direct alias files preserve a predictable import path for SectionCard and ActivityFeed.

`components/dev/pattern-showcase.tsx` demonstrates every pattern in the existing `/dev/ui` route. Tickets fixtures cover list, detail, form and dashboard compositions. The table offers explicit ready/loading/error/empty switches; row actions select the detail record. Confirmation examples support simulated failure and retry. Chart examples include a successful chart, its tabular data, and loading/empty/error cases. All actions stay local; no production writes are performed.

The [pattern guide](phase-2-patterns.md) documents file responsibilities, typed APIs, examples and caller obligations. The existing [HTML presentation](phase-1-explained.html) now covers Phases 0–2 in nine slides totaling 30 minutes, with one visual patterns slide and links to the usage guide. Its offline previews remain illustrative; `/dev/ui` runs the actual components.

Jest 30, jsdom, React Testing Library, user-event and jest-dom are configured for the web workspace using Next's compiler integration. The lockfile records the development-only test dependencies. Existing Node-based foundation tests remain available and independent.

## Verification

- Jest / React Testing Library: **16/16 tests passed across four suites**. Coverage includes both sort directions, numeric/null sorting and immutable input, combined status/date filters and reset, page clamping, row actions, loading/error/empty states and retry; confirmation cancellation/Escape/focus restoration, duplicate submission and pending dismissal protection, failed-action retry; field accessibility/ref/handler preservation, RHF validation and submission; section/breadcrumb semantics, status fallback, details, timeline and chart states/data alternative.
- Foundation regression suite: **18/18 passed**, including source status coverage and light/dark text contrast.
- Full web TypeScript (`tsc --noEmit`) and final incremental checks passed. Scoped ESLint passed for the pattern kit, showcase, tests and Jest configuration. `git diff --check` passed.
- Static HTML checks passed: nine slides, unique IDs and agenda allocations totaling **30 minutes**. Documentation links resolve.
- Chrome checks passed for paging, search/status/reset, detail selection, invalid/valid form submission, rejected/successful confirmation, chart data, light/dark themes and 390px layout without horizontal page overflow. The offline presentation also passed navigation and mobile checks. No browser JavaScript exceptions occurred. A final stable-page check also verifies the corrected filter label.
- One concurrent run hit the default five-second Jest timeout under memory pressure. The initial 15-test suite had passed; after adding the final sorting case and setting a 30-second per-test limit, all 16 tests passed. A cold Next compile also exceeded the first browser navigation timeout; the browser check was retried. One later run overlapped a development hot reload and lost its pagination state; the stable-page run follows all component edits.
- Screenshot review caught a blank selected filter label; supplying Base UI items fixes it, with a regression assertion. An initial Recharts unmeasured-container warning was addressed by supplying a deterministic initial chart size; later requests did not emit it. The Phase 0 hidden-input hydration warning remains an earlier documented limitation rather than a claimed fix here.
- Production build and whole-repository lint were not rerun for Phase 2. Earlier Phase 1 production-build and repository-lint results are historical. The dev browser environment uses the existing local Google Font response fixture because remote font fetching is unreliable here.

## Scope and decisions

- DataTable is explicitly client-side and expects the complete collection. Its typed accessors avoid deriving search/sort values from rendered React nodes. Filters use an explicit caller predicate; server pagination requires a future controlled-mode API rather than silently consuming incomplete results.
- ConfirmDialog awaits success, blocks repeat submission and dismissal while pending, and stays open with a safe error after rejection. Callers retain request cancellation, authorization and backend idempotency responsibilities.
- FormField is a visual single-control composition, compatible with RHF register/Controller. It does not replace the existing lower-level `ui/form` Controller helpers. Validation and submission remain in callers.
- ChartCard is a token-based Recharts bar wrapper with an expandable semantic data table. Additional chart types can extend this API when a real module needs them.
- Timeline/ActivityFeed preserve caller ordering and formatted times. They do not infer workflow events or fetch history.
- Tickets coverage is demonstrated with local fixture compositions. The minimal form proves shared field/validation/action behaviour, rather than reproducing every production Tickets requirement. Production Tickets pages and API services are unchanged; module migration is Phase 5.
- No Phase 3 templates, Phase 4 enforcement or backend/database changes are included. Existing toast systems still coexist. Earlier Phase 0/1 team-review requirements remain pending.
