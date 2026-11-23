# Leadership Excellence (BEES Pillar 01)

Module key: `LEADERSHIP_EXCELLENCE` · Integration branch: `feat/leadership-excellence`
Prototype: [Gemba_Areas_01_02_03_04_05_06_07_Performance_Intelligence.html](../Gemba_Areas_01_02_03_04_05_06_07_Performance_Intelligence.html) — open it in a browser; it is the reference for screens, fields, limits and workflow.

## Areas and owners

| Area | Sub-components | Owner |
|---|---|---|
| 01 Strategic Direction | 01.01 Company direction · 01.02 Excellence pillars · 01.03 Preview & finalise | @rodgers-munene |
| 02 Organisation Framework | 02.01 EMS & organogram · 02.02 Positions & reporting · 02.03 Rules & calendar | _TBD_ |
| 03 Performance Planning | 03.01 Objectives & company goals · 03.02 Department plans · 03.03 Team & individual plans · 03.04 Check & approve | _TBD_ |
| 04 Execution | Results entry · Delivery actions · Support requests | _TBD_ |
| 05 Monitoring & Control | 05.01 Verify results · 05.02 Performance & gaps · 05.03 Alerts & follow-up | _TBD_ |
| 06 Reviews & Development | 06.01 Reviews · 06.02 Feedback & coaching · 06.03 Improvement actions | _TBD_ |
| 07 Performance Intelligence | 07.01 KRA & KPI libraries · 07.02 Dashboards · 07.03 Reports | _TBD_ |

Areas 04–07 share one results / delivery-actions store. Agree the models in `lex-04-execution.prisma` together before 05–07 build on them.

## Dependency chain

```
01 Strategic Direction ─┐
02 Organisation Framework ─┴─▶ 03 Performance Planning ─▶ 04 Execution ─▶ 05 · 06 · 07
```

Dependencies only point upstream: 03 may import 01 and 02, but 01 never imports 03. Two areas importing each other is a Nest circular-dependency error at startup. If an earlier area must react to a later one, use an event or notification.

## Where your area lives

Each owner works only inside their own area's paths (`<area>` = `strategic-direction`, `organisation-framework`, `performance-planning`, `execution`, `monitoring-control`, `reviews-development`, `performance-intelligence`):

| Layer | Path |
|---|---|
| API module, controller, service, DTOs | `apps/api/src/leadership-excellence/<area>/` |
| Database models | `packages/db/prisma/schema/lex-0X-<area>.prisma` |
| Pages (one folder per sub-component, routes already exist) | `apps/web/app/leadership-excellence/<area>/` |
| Components | `apps/web/components/leadership-excellence/<area>/` |
| API client | `apps/web/services/leadership-excellence/<area>.service.ts` |

API routes are prefixed `/leadership-excellence/<area>`. Every controller already carries the tenant, JWT, roles and module guards — keep them.

Build pages from the shared UI kit (`components/ui`, `components/patterns`, `components/templates`) and design tokens, not raw Tailwind colours. See `docs/frontend/`.

## Shared files (module owner only)

Open a PR to the module owner instead of editing these:

- `apps/api/src/app.module.ts` and `apps/api/src/leadership-excellence/leadership-excellence.module.ts`
- `apps/api/src/leadership-excellence/common/` — `contracts.ts`, `lex-roles.ts`
- `packages/db/prisma/schema/lex-common.prisma`
- `apps/web/app/leadership-excellence/layout.tsx` and `page.tsx`
- `apps/web/components/leadership-excellence/LexSidebar.tsx` (already links every sub-page)

## Cross-area contracts

`apps/api/src/leadership-excellence/common/contracts.ts` holds the shapes one area hands to the next. Code against them before the providing area is built.

- An area that needs another area's data imports that area's module and injects its exported service. Never query another area's tables directly.
- Only approved data crosses area boundaries; drafts stay inside their area.
- Each providing owner writes their section of `contracts.ts` first (via PR to the module owner).

## Roles

Use the sets in `common/lex-roles.ts` with `@Roles(...LEX_APPROVERS)` etc. Every set includes `SUPER_ADMIN` — `RolesGuard` denies with a 403 and **no log line**, so a missing role is hard to trace. Roles are a coarse gate; finer rules (assigned editor, HOD reporting scope, no self-verification) belong in your service.

## Branches

- Branch from `feat/leadership-excellence`: `feat/lex-<area>-<topic>`.
- PRs go back into `feat/leadership-excellence`, never straight to `staging`.
- The module branch merges to `staging` when areas are stable.

## Migrations

We do not use `prisma migrate dev` (it asks for a database reset on drifted local databases — never accept it).

1. `git fetch origin && git rebase origin/feat/leadership-excellence` — get everyone's latest schema and migrations.
2. `cd packages/db && npx prisma migrate deploy` — bring your local database up to date.
3. Edit your `lex-0X-<area>.prisma`.
4. Create `prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` with a timestamp of now. Write the SQL by hand, or generate it with
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` and keep **only your own statements** (a drifted database adds unrelated ones, including `DROP`s).
5. `npx prisma migrate deploy && npx prisma generate`.
6. Push and open the PR promptly — an unmerged migration risks someone else's landing with a later timestamp.

Why rebase first: migrations run in folder-name order on a fresh database (CI, new environments). A migration timestamped before one it depends on fails there, and a diff built on stale schema files can drop another area's tables.

Migrations are not applied automatically on deploy; they are run with `migrate deploy` per environment.
