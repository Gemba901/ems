# Frontend kit changelog

Changes to the shared frontend kit: `components/ui`, `components/patterns`,
`components/templates`, the theme tokens in `app/globals.css` and the UI
drift rules in `scripts/ui-drift-rules.mjs`. Add an entry for every change
that module developers need to know about. Put the newest entries first.

Module developers can ask for kit changes in the monthly kit review. Bring
the screen, the gap you hit, and what you used instead.

## 2026-11-27: Phase 5 completion and Phase 6 lock-in

### Enforcement

- UI drift lint is now an **error** for every module except Leave and Steel
  Manufacturing. Previously, strict mode covered a hand-picked list of
  modules. New modules are strict by default.
- Leave and Steel Manufacturing stay at `warn` and are tracked in
  `ui-drift-baseline.json`. `pnpm ui:drift --check` fails if their counts
  go up.
- These shell pieces are now shared infrastructure, so any module may import
  them: `components/chat/ChatWidget`, `components/dev/session-boundary` and
  `components/DashboardHero`.

### Tokens and utilities

- `.theme-direction` (with a `.dark` variant) re-points the primary and ring
  tokens to the Strategic Direction teal. Apply it through
  `DIRECTION_THEME` in `components/leadership-excellence/strategic-direction/ui.tsx`.
  Don't hard-code teal hex values.
- New `bg-auth-backdrop` and `bg-auth-vignette` utilities hold the
  sign-in gradient. They replace the inline `style` gradients on the five
  auth pages.

### Component locations

These components moved so that each one lives in the module that owns it:

| From | To |
| --- | --- |
| `components/strategic-objectives/*` | `components/leadership/strategic-objectives/*` |
| `components/profile/{IdentityCard,InfoGrid,CommitteesCard,RoleAccess,HistoryTimeline}` | `components/operations/profile/*` |
| `components/ems/AccountLinkInvitation` | `components/auth/AccountLinkInvitation` |
| `components/onboarding/{OnboardingShell,CompanyLogoSetup}` | `components/auth/*` |
| `components/onboarding/DashboardTour` | `components/dashboard/DashboardTour` |

The unused `components/profile/MetricCard` and `components/profile/OrgContext`
were removed.

### Usage notes from the migration

- A `Button` with `variant="ghost"` that wraps multi-line or card-like content
  needs `h-auto whitespace-normal`. The default size sets a fixed `h-8` and
  `whitespace-nowrap`.
- To get the indeterminate state on `Checkbox`, use its `indeterminate` prop.
  Don't set it through a DOM ref.
- Radio sets use `RadioGroup` and `RadioGroupItem` with `onValueChange`.
  Don't use native `type="radio"` inputs.
- Modals use `Dialog` with `DialogContent`. `Dialog` handles Escape, focus
  trapping, scroll lock and the backdrop. Remove any hand-written keydown or
  focus effects. Use `showCloseButton={false}` when the dialog has its own
  footer actions, and `initialFocus` to focus the safe action.

## 2026-11-25: Phase 4 enforcement (`9cfdcd8`)

- Added the `ui-drift` ESLint rules: `palette-class`, `native-control`,
  `literal-colour`, `inline-modal` and `cross-module-import`.
- Added `ui-drift-baseline.json` and the `pnpm ui:drift` report, check and
  write commands, plus the CI check and ownership files.

## 2026-10-29: Phases 2 and 3

- Added the pattern kit (`a660fce`): `PageHeader`, `PageSection`,
  `SectionCard`, `StatCard`, `ChartCard`, `DataTable`, `FilterBar`,
  `DetailList`, `Timeline`, `ActivityFeed`, `FormField`, `FormSection`,
  `FormActions`, `ConfirmDialog`, `StatusBadge`, and the empty, error and
  loading states.
- Added the page templates (`c350268`): `ListPageTemplate`,
  `DetailPageTemplate`, `FormPageTemplate` and `DashboardPageTemplate`.

## 2026-10-28: Phases 0 and 1

- Added the semantic status tokens (`info`, `success`, `warning`, `danger`,
  each with `-subtle` and `-foreground`), plus the `overlay` token. Status
  colours were checked for contrast in both themes.
- Added the Base UI primitives, Sonner toasts, accessible React Hook Form
  helpers and the central status map.
