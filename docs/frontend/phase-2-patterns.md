# Phase 2 pattern kit

Implemented for review, 29 October 2026. Patterns compose the Phase 1 controls and Phase 0 tokens. Inspect the live examples at `/dev/ui` (development or explicitly enabled showcase builds). Tickets is the roadmap pilot; these are fixture-based compositions, not a production module migration.

## Files and APIs

All paths below are relative to `apps/web/components/patterns/`. Each component uses named exports and typed props.

| File                | Responsibility                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PageHeader.tsx`    | One page h1, optional description, breadcrumb links and actions. Final breadcrumb is the current page.               |
| `PageSection.tsx`   | Labelled h2 section; also exports the bordered `SectionCard`.                                                        |
| `SectionCard.tsx`   | Direct entry point for the same SectionCard export.                                                                  |
| `StatCard.tsx`      | KPI label/value, optional icon, description and explicitly meaningful trend tone. Zero is preserved.                 |
| `DataTable.tsx`     | Typed columns, stable row IDs, optional sorting/search/filtering, bounded pagination, row actions and data states.   |
| `FilterBar.tsx`     | Controlled search, named selects, inclusive date inputs, invalid-range feedback and reset.                           |
| `StatusBadge.tsx`   | Central `statusToTone()` mapping; readable default label or caller-supplied label. Unknown statuses stay neutral.    |
| `EmptyState.tsx`    | Empty message, explanation and optional action.                                                                      |
| `LoadingState.tsx`  | Announced loading message and reduced-motion-aware spinner.                                                          |
| `ErrorState.tsx`    | Alert, safe caller-provided message and optional retry callback.                                                     |
| `ConfirmDialog.tsx` | Controlled Base UI alert dialog; async confirmation, pending lock, safe failure feedback and retry.                  |
| `FormField.tsx`     | Label, help, required indication and validation error linked to a single control.                                    |
| `FormSection.tsx`   | Fieldset/legend for related inputs.                                                                                  |
| `FormActions.tsx`   | Submit and optional cancel controls; pending state disables both.                                                    |
| `DetailList.tsx`    | Responsive semantic definition list; missing-value fallback.                                                         |
| `ChartCard.tsx`     | Responsive Recharts bar chart with `chart-1`–`chart-5` series, data states and an accessible expandable data table.  |
| `Timeline.tsx`      | Ordered events, actor, machine-readable date, display time and optional description/icon. Also exports ActivityFeed. |
| `ActivityFeed.tsx`  | Direct entry point for the same ActivityFeed export.                                                                 |

## Table and filters

```tsx
<DataTable
  caption="Tickets"
  rows={tickets}
  getRowId={(ticket) => ticket.id}
  searchText={(ticket) => `${ticket.id} ${ticket.subject}`}
  columns={[
    {
      id: "subject",
      header: "Subject",
      cell: (t) => t.subject,
      sortValue: (t) => t.subject,
    },
    {
      id: "status",
      header: "Status",
      cell: (t) => <StatusBadge status={t.status} />,
    },
  ]}
  rowActions={(ticket) => <Button onClick={() => view(ticket.id)}>View</Button>}
/>
```

Pass the **complete client-side collection**, not one server page. Columns are display functions with optional primitive `sortValue`; sorting never mutates the supplied rows. Use stable unique column IDs and record IDs. Search uses the explicit `searchText` accessor, not rendered cells. Filtering/search and sorting reset the current page; shrinking data clamps it to a valid page. Invalid/nonpositive page sizes fall back to a safe positive size. Loading/error hide stale data. Parent components own fetching, cancellation, permissions and retry behaviour.

`FilterBar` is controlled via `FilterValues` (`search`, `filters`, `from`, `to`). Select values must be nonempty; the empty string is reserved for All. For DataTable, provide `matchesFilters(row, values)` when enabling select/date filters; the table cannot infer domain field names. Date values are ISO `YYYY-MM-DD`; the demo uses inclusive bounds. An inverted range is marked invalid; the domain predicate decides whether to show zero records or retain previous results. Use `searchable={false}` for standalone filter bars without search. Reset clears every filter.

Server-driven pagination is outside this initial client-side API. Do not silently pass a truncated API result; add an explicit controlled server-mode API and tests before adopting the table for such endpoints.

## Forms

```tsx
// RHF provides control state and submission; the pattern provides presentation.
const {
  register,
  handleSubmit,
  formState: { errors, isSubmitting },
} = useForm<Values>();
<form onSubmit={handleSubmit(save)}>
  <FormSection title="Request details">
    <FormField
      label="Subject"
      required
      description="Describe the issue briefly."
      error={errors.subject?.message}
    >
      <Input {...register("subject", { required: "Enter a subject" })} />
    </FormField>
  </FormSection>
  <FormActions pending={isSubmitting} onCancel={cancel} />
</form>;
```

Import this visual wrapper from `patterns/FormField`. The existing `ui/form` FormField is the lower-level RHF Controller helper; its API remains intact. Do not nest both accessibility wrappers on the same control. The pattern clones one control and preserves its ref/handlers and existing described-by IDs. For a composite Select, put the FormField around SelectTrigger inside Select; supply the value/onValueChange on Select. Business validation stays in RHF/Zod or the caller. `aria-required` communicates required state; callers supply actual native `required` or validation rules.

## Confirmations

Use controlled `open` / `onOpenChange`, a descriptive title, clear consequences and an `onConfirm` returning a Promise. Resolve only when the operation succeeds; reject on failure. The dialog closes after success and stays open on rejection. Pending operations disable cancellation and repeat submission and reject Escape dismissal. The internal guard prevents rapid duplicate clicks, but backend idempotency and authorization remain the caller's responsibility. Do not externally force-close/unmount a pending dialog; if a workflow requires cancellation, implement request cancellation in its owner. Reopening clears the previous error. Internal exception details are never shown.

## Charts and histories

ChartCard currently supports bar series only; each series chooses a chart token. Supply a category key and numeric series values. The expandable table provides the same values without depending on chart colour or SVG accessibility. Modules choose safe aggregate data and labels. History items require stable IDs, ISO `dateTime` and already formatted `timeLabel`; the caller controls ordering, time zones and permissions. ActivityFeed is an alias of Timeline, not a second implementation.

## Tickets pilot coverage

| Need      | Showcase composition                                                                                  |
| --------- | ----------------------------------------------------------------------------------------------------- |
| List      | PageHeader, DataTable, FilterBar, StatusBadge, loading/empty/error states, View row action            |
| Detail    | SectionCard, DetailList and Timeline; row actions select the fixture record                           |
| Form      | FormSection, labelled/validated FormField and pending FormActions                                     |
| Dashboard | StatCard and ChartCard, including chart data states                                                   |
| Workflow  | Async ConfirmDialog, including simulated rejection and retry; ActivityFeed for approval-style history |

`components/dev/pattern-showcase.tsx` contains these local examples and is rendered by the existing showcase. The minimal form demonstrates presentation/validation rather than reproducing the full Tickets creation contract; subject, message, department and module can use the same field composition during Phase 5. No production Tickets API or page is changed. Whole-page templates are Phase 3.

## Verification

Run `pnpm --filter web test:ui-patterns` for Jest/React Testing Library behaviour tests, then `pnpm --filter web test:ui-foundations` for token/status regressions. Check TypeScript and scoped lint, then inspect `/dev/ui` in light/dark mode, with keyboard navigation and at mobile width. The implementation report records actual results and limitations.
