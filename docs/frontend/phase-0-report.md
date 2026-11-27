# Phase 0 foundations review

Implemented on 28 October 2026. **Status: In review** — the roadmap also requires team review of the conventions and merging the tokens. Those human review/merge steps have not been claimed as completed.

## What changed

- `conventions.md` defines layer boundaries, file/component naming, token-only colours, shared-component requests, accessibility and the Lucide icon rules.
- `apps/web/app/globals.css` maps primary to Gemba navy with light text in light mode and Gemba lime with navy-deep text in dark mode. Focus rings use lime-ink/light and lime/dark. The existing semantic status colours remain in place.
- The same CSS file defines `text-page-title` (24px mobile / 30px desktop), `text-section-title` (20px), `text-body` (14px), `text-caption` (12px); `p-page` (16/24px), `gap-section`/`space-y-section` (24px), `p-card` (16px), `p-card-compact` (12px) and `gap-control` (8px). These scales are demonstrated in `/dev/ui` without rewriting existing module typography.
- `apps/web/lib/status.ts` is the shared status-tone map and helper API. It covers Prisma status enums, frontend declared statuses/states, attendance location checks, derived audit/attendance states and string-backed API ingestion/onboarding states. New code uses `statusToTone()` with Badge or `statusBadgeClass()` for classes.
- `apps/web/lib/steelStatusColors.ts` is retained as a deprecated compatibility bridge. Existing Steel imports and uppercase semantic API still work; all status/colour decisions delegate to the central helper. Its original status meanings are covered by regression tests.
- `Button` now supplies 20px action icons, including compact sizes. Badge icons use the 16px inline default. Internal check indicators and avatar dots retain their primitive geometry. New code uses Lucide only; legacy module icon overrides migrate later.
- `components/patterns/README.md` and `components/templates/README.md` reserve the folders and document their layer boundaries. No Phase 2 patterns or Phase 3 templates have been implemented early.
- `/dev/ui` demonstrates the new scale, icons and central status mapping. The standalone `phase-1-explained.html` is now an eight-section **30-minute** walkthrough of Phases 0 and 1, retaining clickable control designs and adding one visual foundations slide.

## Important mapping decisions

`ACTIVE` is informational because it describes an ongoing state. `CANCELLED` remains danger to preserve existing Steel semantics. Failed/rejected/overdue are danger; waiting/partial/attention-needed states are warning. Unknown values, nulls and prototype names safely fall back to neutral. Case and surrounding whitespace are normalized. The helper only controls display, never permissions or transitions.

The conventions require owner review before introducing a context-specific exception for a shared status name. Module colour-map migrations remain Phase 5; the existing Steel bridge delegates immediately so there is no second authoritative map.

## Verification

- Foundation suite: **18/18 passed**. Coverage inventories 106 explicit states, checks fallback handling and Steel compatibility, and verifies all status colour pairs. Primary text contrast is **11.88:1 light** and **6.42:1 dark**.
- TypeScript (`tsc --noEmit`) and ESLint for changed TypeScript/test files passed. `git diff --check` passed.
- Chrome checks passed for the standalone presentation: eight sections, 30-minute allocation, light/dark themes, mobile layout, navigation and interactive controls.
- Live `/dev/ui` checks passed for computed typography, spacing, brand colours, icon sizes, mobile layout and dialog keyboard behaviour. The existing light/dark interaction suite also passed for dialogs, sheets, tabs, menus, popovers, tooltips, select, form validation/submission and toasts.
- Steel Furnaces rendered with mocked session/data, including its add-furnace modal. No writes were submitted.
- No browser JavaScript exceptions occurred. A nonblocking React hydration attribute warning appeared for Base UI hidden-input style normalization; it remains unresolved. The interaction checks passed despite that warning.
- Production build and whole-repository lint were **not rerun for Phase 0**. The earlier Phase 1 build result and repository lint baseline in its report are historical, not fresh Phase 0 results. Browser checks used a local font-response fixture because the development environment cannot reliably fetch Google Fonts.

Run the focused foundation suite with:

```sh
pnpm --filter web test:ui-foundations
```

It independently inventories backend enums, frontend declarations and string-backed API statuses, checks meaningful tone distinctions and Steel compatibility, and verifies AA contrast for all status and primary text/background pairs.

Phase 4 automated enforcement and Phase 5 module migration remain future work. Sonner and the existing useToast still coexist; this change does not migrate toast consumers.
