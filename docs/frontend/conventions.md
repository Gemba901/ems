# Frontend conventions

**Owner:** Rodgers Munene. **Status:** implemented for team review, 28 October 2026.

These are the Phase 0 foundations for new shared UI work. Existing modules migrate in Phase 5; automated lint/CI enforcement is Phase 4. Review these rules and the visual presentation before merging the foundation changes.

## Layers and folders

Every layer may import the layers below it. Shared kit code must not import module components, services or organization-specific business rules.

| Layer         | Location                                                  | Contains                                                                                    |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Design tokens | `apps/web/app/globals.css`, `apps/web/lib/status.ts`      | Colour, type, spacing, radius and the central status-tone map                               |
| Primitives    | `apps/web/components/ui/`                                 | General controls; Base UI/shadcn base-nova, without module business logic                   |
| Patterns      | `apps/web/components/patterns/`                           | Repeated compositions such as PageHeader, DataTable and StatusBadge; implemented in Phase 2 |
| Templates     | `apps/web/components/templates/`                          | Complete list/detail/form/dashboard layouts; implemented in Phase 3                         |
| Module UI     | `apps/web/app/<module>/`, `apps/web/components/<module>/` | Data fetching, permissions, workflow and domain-specific content                            |

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

If the same status string needs different business meanings in two modules, request an explicit central API decision from the frontend owner; do not introduce a local status-colour map. A future StatusBadge pattern will consume this helper in Phase 2.

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

The owner decides whether to extend a primitive, create a shared pattern/template, or approve a module-specific exception. Record the decision in the relevant issue/PR; do not create an unreviewed duplicate. Requests and exceptions are reviewed by people until Phase 4 enforcement is built.

## Verification and review

Inspect the real components in `/dev/ui`; use the HTML presentation to discuss designs. Check light/dark mode, keyboard use, invalid/disabled/loading states and an existing consumer when a shared API changes. Run targeted tests, TypeScript and scoped lint. Token changes must retain AA normal-text contrast for status and primary colour pairs.

Team review and merge of these foundations are the Phase 0 exit criteria. Implementation checkboxes do not imply that team review has already happened. Module migration, patterns, templates, new lint rules and CI changes remain separate phases.
