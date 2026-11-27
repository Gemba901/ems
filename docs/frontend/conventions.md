# Frontend conventions

**Owner:** Rodgers Munene. **Status:** implemented for team review, 28 October 2026.

Use these foundations for new shared UI work. Existing modules migrate in Phase 5. Phase 4 adds ESLint warnings and a CI baseline check for module UI. See the [enforcement workflow](roadmap.md#phase-4-enforcement-m) for local commands and baseline updates.

## Layers and folders

Every layer may import the layers below it. Shared kit code must not import module components, services or organization-specific business rules.

| Layer         | Location                                                  | Contains                                                                                                               |
| ------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Design tokens | `apps/web/app/globals.css`, `apps/web/lib/status.ts`      | Colour, type, spacing, radius and the central status-tone map                                                          |
| Primitives    | `apps/web/components/ui/`                                 | General controls; Base UI/shadcn base-nova, without module business logic                                              |
| Patterns      | `apps/web/components/patterns/`                           | Repeated compositions such as PageHeader, DataTable and StatusBadge; implemented in Phase 2; see `phase-2-patterns.md` |
| Templates     | `apps/web/components/templates/`                          | Complete list/detail/form/dashboard layouts; implemented in Phase 3                                                    |
| Module UI     | `apps/web/app/<module>/`, `apps/web/components/<module>/` | Data fetching, permissions, workflow and domain-specific content                                                       |

Use `@/components/ui/...` and `@/lib/status` imports in app code. Keep relative imports within a helper's own layer when needed for standalone tests. Do not import another module's components to reuse a shared UI element; ask for a kit component instead.

`CoverCard`, `FinancialImpact`, `LinkedRecordChip` and `SpeechToTextButton` currently remain under `ui/` as explicit legacy exceptions. Do not copy this placement for new module-specific components. Their eventual move must preserve existing imports and is separate migration work.

## Naming and public APIs

- React components and their props use PascalCase: `PageHeader`, `PageHeaderProps`.
- Primitive filenames retain shadcn kebab-case: `radio-group.tsx`, `alert-dialog.tsx`. Patterns and templates use PascalCase filenames matching their exports: `PageHeader.tsx`, `ListPageTemplate.tsx`.
- Hooks use `useCamelCase`; non-component helpers use descriptive kebab-case filenames. `lib/status.ts` is the shared status entry point.
- Prefer named exports, typed props, `cn()` for class composition, `cva` when there are style variants, and `data-slot` on primitive elements.
- Preserve published primitive variants, props, refs and event handlers. Use Base UI composition, not an additional Radix dependency.
- Add `"use client"` only where hooks, handlers or browser APIs require it. Read the installed Next.js guides before changing routing or server/client boundaries.

## Colour and brand

**Never write a colour value in module or shared component code; use a token.** Colour definitions live in `globals.css`. Avoid hex/RGB/OKLCH literals, arbitrary colour classes and raw Tailwind palette classes in new kit/module UI.

| Meaning           | Utilities                                                                              |
| ----------------- | -------------------------------------------------------------------------------------- |
| Page surface/text | `bg-background text-foreground`                                                        |
| Card or popover   | `bg-card text-card-foreground`, `bg-popover text-popover-foreground`                   |
| Supporting text   | `text-muted-foreground`                                                                |
| Primary action    | `bg-primary text-primary-foreground` (normally through Button)                         |
| Border/focus      | `border-border`, `border-input`, `ring-ring`                                           |
| Status            | `bg-success-subtle text-success` and the equivalent warning/info/danger/neutral tokens |
| Chart             | `chart-1` through `chart-5`                                                            |

Primary is **Gemba navy with light text in light mode**, and **Gemba lime with navy-deep text in dark mode**. Focus rings use lime-ink in light mode and lime in dark mode. Brand identity colours describe identity; status tones describe state. A red process identity does not mean that process is failing.

The standalone HTML presentation has embedded preview colours so it works offline; it is documentation, not an alternative production kit. Keep its previews aligned with `globals.css`.

## Type and spacing scale

Use the named utilities rather than selecting a new size for each page. These tokens set the scale; patterns/templates will apply it as they are built. Existing module typography is not rewritten in Phase 0.

| Role            | Utility              | Size / line height                               |
| --------------- | -------------------- | ------------------------------------------------ |
| Page heading    | `text-page-title`    | 24px on mobile, 30px from 768px; 1.2; weight 700 |
| Section heading | `text-section-title` | 20px; 1.4; weight 600                            |
| Body            | `text-body`          | 14px; 1.5                                        |
| Caption/help    | `text-caption`       | 12px; 1.4                                        |

| Use                  | Utility                           | Scale                           |
| -------------------- | --------------------------------- | ------------------------------- |
| Page padding         | `p-page`                          | 16px on mobile, 24px from 768px |
| Between sections     | `gap-section` / `space-y-section` | 24px                            |
| Card padding         | `p-card`                          | 16px                            |
| Compact card padding | `p-card-compact`                  | 12px                            |
| Between controls     | `gap-control`                     | 8px                             |

The md breakpoint is `48rem`, matching Tailwind's default 768px at the normal root font size. Values use rem so browser font settings remain effective. Keep the existing radius tokens and the primitives' compact control sizes.

## Status mapping

`lib/status.ts` is the single source for display meaning. It covers backend lifecycle enums, frontend status/state unions, attendance location checks and derived audit/attendance states, plus ingestion/onboarding states stored as strings. Coverage tests read source definitions and fail when a new declared status has no entry.

```tsx
import { Badge } from "@/components/ui/badge";
import { statusToTone } from "@/lib/status";

<Badge variant={statusToTone(record.status)}>{record.status}</Badge>;
```

`statusBadgeClass(status)` is available for legacy class-based consumers. `steelStatusColors.ts` is a deprecated compatibility bridge that delegates to this map; it no longer owns colours or workflow mappings.

Mapping decisions: pending/review/partial progress → warning; ongoing work → info; successful completion → success; rejection/failure → danger; draft/archive/not-applicable → neutral. `ACTIVE` is informational; `CANCELLED` remains danger to preserve the existing Steel meaning. Lowercase/title-case values and surrounding whitespace are normalized; unknown values safely return neutral. Preserve a readable text label so colour is never the only signal. These tones must never be used for permissions or workflow transitions.

If the same status string needs different business meanings in two modules, request an explicit central API decision from the frontend owner; do not introduce a local status-colour map. The `components/patterns/StatusBadge.tsx` pattern consumes this helper.

## Icons

Use `lucide-react` for new UI; do not add a second icon library, emoji icons or copied SVG paths for controls.

- Inline icons: `size-4` (16px).
- Button/action icons: `size-5` (20px), including compact buttons. Button supplies this default unless the caller explicitly sizes an icon.
- Page/section heading icons: `size-6` (24px).
- Internal check indicators, avatar dots and loading illustrations retain the primitive's own geometry; these are not module action icons.
- Decorative icons use `aria-hidden="true"`; icon-only buttons require a readable `aria-label`. A tooltip alone is not the accessible name.

Legacy explicit icon classes are migrated with their modules in Phase 5; Phase 0 sets the rule and shared Button/Badge defaults without rewriting module pages.

## Requesting a shared component

Before building a common control, check `components/ui/`, then the live `/dev/ui` route. For repeated compositions, check the pattern/template roadmap.

Send the frontend owner a request containing:

1. The workflow and module/page that needs it.
2. Existing kit components tried and the missing behaviour or variant.
3. A sketch/example plus required loading, empty, error, disabled and keyboard states.
4. Whether a second module can reuse it and any accessibility requirements.

The owner decides whether to extend a primitive, create a shared pattern/template, or approve a module-specific exception. Record the decision in the relevant issue/PR; do not create an unreviewed duplicate. The frontend owner reviews shared additions and module-specific exceptions.

## Verification and review

Inspect the real components in `/dev/ui`; use the HTML presentation to discuss designs. Check light/dark mode, keyboard use, invalid/disabled/loading states and an existing consumer when a shared API changes. Run targeted tests, TypeScript and scoped lint. Token changes must retain AA normal-text contrast for status and primary colour pairs.

Team review and merge of these foundations are the Phase 0 exit criteria. Implementation checkboxes do not imply that team review has already happened. Module migration, patterns, templates, new lint rules and CI changes remain separate phases.

## Pattern kit usage

See [Phase 2 pattern APIs and examples](phase-2-patterns.md) for table, filter, form, confirmation, chart and history contracts. Keep module data fetching and permissions outside the patterns.

## Phase 3 page templates

Templates live in `apps/web/components/templates/`. They compose the pattern kit and keep module data fetching, authorization, validation and navigation in callers. The surrounding app shell supplies page padding; templates supply section spacing and responsive internal layout. Use one template per page: each owns the page h1. Do not nest templates or add another main landmark inside the app shell.

### ListPageTemplate

```tsx
import { ListPageTemplate } from "@/components/templates/ListPageTemplate";

<ListPageTemplate
  header={{ title: "Tickets", description: "Requests needing attention" }}
  table={{
    caption: "Tickets",
    rows: tickets,
    getRowId: (t) => t.id,
    searchText: (t) => t.subject,
    columns: [
      {
        id: "subject",
        header: "Subject",
        cell: (t) => t.subject,
        sortValue: (t) => t.subject,
      },
    ],
  }}
/>;
```

`header` accepts PageHeader props; `table` accepts the complete typed DataTable API. Its FilterBar is already included when search/filters are configured; do not add a second independent filter bar. Optional `beforeTable` / `afterTable` slots accept module content. Pass a complete client-side collection; the Phase 2 table contract still applies. Module callers pass loading/error/retry through `table` and enforce row-action permissions.

### DetailPageTemplate

```tsx
import { DetailPageTemplate } from "@/components/templates/DetailPageTemplate";
import { SectionCard } from "@/components/patterns/SectionCard";

<DetailPageTemplate
  header={{ title: ticket.reference }}
  status={ticket.status}
  details={[{ label: "Assignee", value: ticket.assigneeName }]}
  activity={events}
>
  <SectionCard title="Request">{ticket.message}</SectionCard>
</DetailPageTemplate>;
```

The main column is `children`. `details` feeds DetailList; `activity` feeds Timeline. Optional `sidebar` adds module content, with `sidebarLabel` naming the aside. The sidebar is omitted when none of these are supplied, so the main content uses the available width. On small screens, main content appears before the sidebar; from `lg`, columns use a 2:1 split. Omit `status` to hide the badge; explicit null renders Unknown. `statusLabel` overrides its readable label. Callers handle record-level loading/not-found/error/permission states before rendering a populated detail view; individual sections can use shared data-state patterns.

### FormPageTemplate

```tsx
import { FormPageTemplate } from "@/components/templates/FormPageTemplate";
import { FormField } from "@/components/patterns/FormField";
import { Input } from "@/components/ui/input";

<FormPageTemplate
  header={{ title: "Create ticket" }}
  onSubmit={handleSubmit(save)}
  noValidate
  sections={[
    {
      id: "request",
      title: "Request",
      content: (
        <FormField label="Subject" required error={errors.subject?.message}>
          <Input {...register("subject", { required: "Enter a subject" })} />
        </FormField>
      ),
    },
  ]}
  actions={{
    pending: isSubmitting,
    onCancel: cancel,
    submitLabel: "Create ticket",
  }}
  error={saveError}
/>;
```

Supply stable section IDs; each becomes a FormSection fieldset. The template owns one labelled native form and its FormActions: do not wrap it in another form or supply nested forms inside sections. `onSubmit` belongs to the module; use RHF/Zod or native constraints as appropriate. Native validation remains enabled unless `noValidate` is set. `actions.pending` and `actions.disabled` also guard submit events, including Enter-key/programmatic submit events, rather than disabling only the button. Pending disables cancellation; disabled only disables saving. Callers must still own mutation guards, server validation and idempotency. `error` is a page-level save error, while field errors belong in FormField. Use safe user-facing messages.

The action footer is `position: sticky; bottom: 0` with an opaque token-based background and remains in form flow. Avoid overflow wrappers that unintentionally establish another scroll container. The form supplies scroll margins to inputs, textareas and buttons so focused controls can clear the footer; check custom composite controls and the mobile keyboard in the consuming page. Optional `id` overrides the generated form ID. Cancel actions are buttons with `type="button"` and never submit.

### DashboardPageTemplate

```tsx
import { DashboardPageTemplate } from "@/components/templates/DashboardPageTemplate";

<DashboardPageTemplate
  header={{ title: "Tickets overview" }}
  stats={[{ id: "open", label: "Open tickets", value: openCount }]}
  charts={[
    {
      id: "volume",
      title: "Tickets by day",
      categoryKey: "day",
      data: volume,
      series: [{ key: "count", label: "Tickets", token: "chart-1" }],
    },
  ]}
  loading={isLoading}
  error={loadError}
  onRetry={refetch}
/>;
```

Stats render in one/two/four columns depending on available breakpoint; charts render in one/two columns. Supply stable IDs separately from pattern props. `children` adds module sections below the grid. Loading/error replaces stale dashboard content while preserving the header; retry remains caller-owned. Empty stats/charts without children show EmptyState. Each chart can also use its own loading/error/retry props for partial failures. ChartCard's accessible data alternative remains available.

`ListPageTemplate`, `FormPageTemplate` and `DashboardPageTemplate` are client entry points; functions such as column renderers and submit handlers must be defined in a client module, rather than passed across a Server Component boundary. DetailPageTemplate can compose server-rendered content with the client status badge. See the installed Next.js client/server guidance when integrating a new route.

Live Tickets fixture examples for all four templates are in `/dev/ui` under **Phase 3 · Page templates**. Production module migration stays in Phase 5.
