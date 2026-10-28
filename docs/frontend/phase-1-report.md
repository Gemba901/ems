# Phase 1 primitive kit review

> Historical Phase 1 snapshot. The subsequent [Phase 0 implementation](phase-0-report.md) now maps primary to the Gemba brand, adds the central status map and establishes conventions/scales/icon rules. The earlier owner-decision notes below describe the state before that follow-up.

Implemented on `feat/frontend-kit-phase-1`. No module migrations, patterns, templates or enforcement changes are included.

## Files

- **Tokens:** `apps/web/app/globals.css` adds five status tones (base, foreground and subtle), light/dark definitions, Tailwind mappings and an overlay token. Existing token values, including `primary`, are preserved. `apps/web/tests/ui-tokens.test.mjs` checks AA text contrast for both themes.
- **Primitives:** `apps/web/components/ui/` adds `select`, `textarea`, `label`, `checkbox`, `radio-group`, `switch`, `dialog`, `alert-dialog`, `sheet`, `tabs`, `table`, `dropdown-menu`, `skeleton`, `separator`, `scroll-area`, and `sonner`. `apps/web/package.json` and `pnpm-lock.yaml` add Sonner only.
- **Variants:** `badge.tsx` adds success/warning/info/danger/neutral. `button.tsx` adds `destructive-solid`; existing icon sizes remain unchanged. Solid destructive actions already appear in Calendar's AgendaView/AgendaItemBody, Admin's organizations page, and the SGA/Kaizen draft wizards. Card and Input already use semantic colour tokens. Popover and Tooltip now use semantic colours too. Browser checks found that the existing Tooltip lacked a tooltip role and an accessible trigger association; both are now supplied while preserving controlled/uncontrolled usage.
- **Forms:** `components/ui/form.tsx` supplies the provider, typed Controller wrapper, item context, labels, control composition, descriptions and error messages. `FormControl` merges through Base UI `useRender`, preserving handlers and refs and supplying label/error associations. The showcase demonstrates the Zod resolver and all six input families.
- **Showcase:** `app/dev/ui/page.tsx` gates production through `notFound()`, with `NEXT_PUBLIC_ENABLE_DEV_UI=true` as an explicit staging build override. `components/dev/ui-showcase.tsx` renders primitives, variants, status/brand/semantic swatches, interactive examples and the validated form. It includes the four legacy components without moving or restyling them; the speech demo is client-only to avoid its browser support check causing a hydration mismatch. Select examples supply Base UI item labels and map an empty form value to null for the placeholder.
- **Integration:** `components/dev/session-boundary.tsx` bypasses session restoration for the exact data-free `/dev/ui` route. Other routes still use the existing SessionProvider. `app/layout.tsx` uses this boundary and mounts Sonner once alongside the existing ToastProvider.

## Generation and adaptations

All 16 requested primitives were generated using `pnpm dlx shadcn@latest add ...` with the existing `base-nova` config. The existing Button was explicitly preserved at the overwrite prompt. The latest registry imports `cn` as a package; these imports were changed to the existing `@/lib/utils` helper, and the unused generated `cn` dependency was removed. Sonner uses CSS tokens directly instead of introducing next-themes or a theme provider.

The registry's `form` dry run supplied no component. Its `field` implementation was inspected for label, grouping and error composition. The required React Hook Form/context API was written by hand because the registry's generic field layout does not provide it. No Radix dependencies were added. Generated overlay palette colours were replaced with `overlay`; AlertDialogAction composes the Base UI close primitive so a successful confirmation closes the dialog.

## Status tokens and contrast

Warning, info, neutral, subtle colours and dark tones are stored as OKLCH in CSS. The table shows their sRGB equivalents for review. Light success and danger reference the existing Gemba lime-ink and red-ink variables.

Ratios are **foreground on base / base text on subtle**. All meet the 4.5:1 AA threshold for normal text.

| Tone | Light base / foreground / subtle | Light ratios | Dark base / foreground / subtle | Dark ratios |
|---|---|---|---|---|
| success | `#4a7512` / `#ffffff` / `#f0f7e5` | 5.46 / 4.98 | `#a3d65c` / `#182608` / `#243616` | 9.34 / 7.64 |
| warning | `#854d0e` / `#ffffff` / `#fef9c3` | 6.85 / 6.38 | `#facc15` / `#352600` / `#422f08` | 9.60 / 8.35 |
| info | `#075985` / `#ffffff` / `#e0f2fe` | 7.56 / 6.59 | `#7dd3fc` / `#082f49` / `#0c344b` | 8.32 / 7.83 |
| danger | `#b42828` / `#ffffff` / `#fef2f2` | 6.41 / 5.86 | `#fca5a5` / `#450a0a` / `#481b1b` | 8.51 / 7.64 |
| neutral | `#475569` / `#ffffff` / `#f1f5f9` | 7.58 / 6.92 | `#cbd5e1` / `#0f172a` / `#273449` | 12.02 / 8.45 |

## Owner decisions

- Whether to remap `primary` to the Gemba brand. Its existing values are preserved.
- Whether Sonner should eventually replace the existing `useToast`; both currently coexist.
- Phase 0 still needs conventions, type/spacing decisions, the central status map and the folder decision for the four legacy UI components.
- The legacy SpeechToTextButton remains unchanged; the app's existing Permissions-Policy disables microphone access, so its live recording cannot be verified in this showcase.

## Verification

Checks use Node 20.19.0 and pnpm 9.15.9.

| Check | Result |
|---|---|
| `pnpm --filter web lint` | **FAIL (existing baseline):** 156 errors and 130 warnings in existing code. No errors were reported in the primitive/showcase files. A redundant full rerun was stopped to free memory. |
| Focused ESLint over every added/changed TypeScript file and the token test | **PASS.** The final tooltip/showcase/layout changes also passed a follow-up scoped run. |
| `pnpm --filter web exec tsc --noEmit` | **PASS** after regenerating stale Next route types with `next typegen`. The independent command was rerun successfully after the final source changes; the fixture production build also passed its full TypeScript check. |
| `node --test apps/web/tests/ui-tokens.test.mjs` | **PASS:** 10 cases, covering 20 foreground/background pairs. |
| `pnpm --filter web dev` | **BLOCKED** in this environment: Turbopack did not respond within the browser timeout. The webpack fallback then encountered Google Fonts connection timeouts. |
| Webpack dev server with local font fixture | **PASS:** unauthenticated `/dev/ui` loads and the light/dark browser interaction suite passes with no browser exceptions. |
| Steel Furnaces compatibility | **PASS with mocked session/API data:** existing Button, Badge, Input and the Add Furnace modal render; no mutation was submitted. Live backend behaviour was not tested. |
| `pnpm --filter web build` | **BLOCKED by Google Fonts access:** repeated Node connection timeouts; stopped the attempt rather than leaving it retrying. **PASS with the real font fixture:** the complete production build, TypeScript validation and all 120 static pages completed successfully. |
| Production `/dev/ui` gate | **PASS:** `pnpm --filter web start` served `/dev/ui` with HTTP **404** when the override was false. |

The normal build and dev server could not fetch Inter through Node in this environment, while curl could fetch the same Google Fonts resources. For local verification only, the actual Inter stylesheet and seven font subsets were downloaded to `/tmp` and supplied through Next's `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` test hook. No application font settings or build scripts were changed. The fixture contains the real font files, rather than a substitute font.

The browser suite exercised dialog focus/Tab trapping/Escape/focus restoration, confirmation cancel/confirm, all sheet sides, tabs, menu actions/checkbox, popover, tooltip, Select, all six form control types, five validation messages, error description IDs, reset, successful submit and toast variants. A final pass also verified the small Select/Switch/AlertDialog, horizontal/vertical line tabs, menu radio items and submenu, disabled Select, indeterminate Checkbox, and both ScrollArea directions. The legacy speech demo was not activated because microphone access is disabled by the app's existing policy.

Review screenshots are local, uncommitted artifacts: `/tmp/phase1-light.png`, `/tmp/phase1-dark.png`, `/tmp/phase1-form-light.png`, `/tmp/phase1-form-dark.png`, `/tmp/phase1-mobile.png`, and `/tmp/phase1-steel.png`. Final tooltip/validation checks also passed after the last changes; refreshed artifacts include `/tmp/phase1-top-light.png`, `/tmp/phase1-top-dark.png`, `/tmp/phase1-form-errors-light.png`, `/tmp/phase1-form-errors-dark.png`, and `/tmp/phase1-mobile-top.png`.

Phase 1 stays **In review** because repository-wide lint is not clean and an unmodified online build cannot be confirmed in this environment.
