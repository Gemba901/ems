# Area 03 — Performance Planning & Alignment

This module owns SWOT assessments, company objectives and linked goals, department plans, team/individual contributions, and plan approval. It uses the existing Leadership Excellence shell, authentication and organisation module guards. It does not maintain a second objective/goal register or copy EMS master records.

## Entry points

Frontend routes are under `/leadership-excellence/performance-planning`:

| Route | Purpose |
| --- | --- |
| `/objectives` | SWOT by pillar, summary/decisions, strategic objectives and linked SMART goals |
| `/department-plans` | Department contributions, KRA/KPI assignments, period targets and delivery actions |
| `/team-individual-plans` | Team and individual contributions, assignments, actions and acknowledgement |
| `/check-approve` | Readiness checks, approval, revisions, history and management backup/restore |

The API prefix is `/leadership-excellence/performance-planning`. Browser requests use the same-origin `/api` proxy before that prefix.

| Method and path | Behaviour |
| --- | --- |
| `GET /workspace` | Actor-filtered planning records and existing EMS reference IDs; an empty workspace does not create business records |
| `POST /commands` | Mutate the shared workspace through validated commands |
| `GET /approved` | Effective approved non-SWOT plans for downstream consumers, filtered for the requesting actor |
| `GET /periods?start=YYYY-MM-DD&end=YYYY-MM-DD&frequency=MONTHLY` | Generate reporting periods without inventing target values |
| `GET /:documentId/findings/:findingId/evidence` | List evidence metadata after assessment access checks |
| `POST /:documentId/findings/:findingId/evidence?revision=N` | Attach one multipart `file` to an editable, unreviewed finding |
| `GET /:documentId/findings/:findingId/evidence/:id` | Download evidence with the same tenant and assessment checks |
| `GET /backup` | Management-only signed export of planning state and evidence |
| `POST /restore?revision=N` | Management-only multipart `file` restore from an original same-organisation export |

## Commands and persistence

The command envelope is `{ expectedRevision, action, documentId?, payload }`. The server generates IDs and codes; clients retain and submit those references.

- `CREATE_PLAN`: create a `SWOT`, `COMPANY`, `DEPARTMENT`, `TEAM`, `POSITION` or `INDIVIDUAL` draft for a cycle/scope. Open the existing record when that combination already exists. Position scopes require a stable position ID supplied by EMS/Area 02; job-title text is not a position ID.
- People plans can be drafted before their department plan exists. They retain their real EMS department; the same-year department plan becomes a readiness check at submission/approval. Creating that department draft clears the prerequisite without replacing the saved people plan. Linked contributions still require an approved parent goal; essential ongoing responsibilities remain supported.
- `SAVE_SETTINGS`: update plan metadata and permitted access settings.
- `SAVE_ITEM` / `DELETE_ITEM`: manage a finding, objective, goal, assignment or action. Reviewed or referenced items cannot be deleted.
- `LINK_ACTION` / `UNLINK_ACTION`: attach or detach a reference to an approved department action in a contribution plan. The reference keeps the department document ID, original action ID and approved version; it does not create another action.
- `CONSIDER_PILLAR`: record that a fixed pillar has been assessed; empty quadrants are allowed.
- `CONSIDER_ALL_PILLARS`: confirm all six fixed pillars together in one editable SWOT assessment. Existing confirmations stay marked; repeated requests never toggle them off. The audit records the newly considered pillars. Later finding edits still clear consideration for their affected primary/shared pillars, requiring renewed confirmation.
- `SAVE_DEFINITION`: create or adapt a reusable KPI definition under an existing/new KRA without overwriting an existing definition.
- `SUBMIT`, `APPROVE`, `RETURN`: one designated authorised approver; finalisation validates completeness.
- `REVISE`: open a draft with a reason and effective date while preserving approved versions.
- `ACKNOWLEDGE`: acknowledge the employee's own effective approved individual plan.

`LexPlanningWorkspace` stores one versioned JSON aggregate per organisation. All planning screens operate on this state. Commands use a database transaction and compare-and-swap on `revision`; a stale write returns `409` rather than overwriting another editor. Refresh the register and reconcile before retrying. This is an aggregate persistence model, not a new department/employee master.

Draft fields may be incomplete. Referential checks, tenant membership, valid supplied values and the minimum SWOT finding fields still apply when saving. Full readiness validation runs before submission/approval. Missing numeric data remains `null`, distinct from zero.

SWOT findings use an independent integer `weightage` from 1 to 10. The server derives `priority`: 1–3 `LOW`, 4–6 `MEDIUM`, 7–10 `HIGH`, ignoring any priority sent by the client. A draft may leave weightage `null` (Not assessed); submission/approval requires every finding to have a valid score and matching derived priority. Display scored findings from highest to lowest, with unassessed findings last. Existing approved snapshots without weightage remain unchanged; do not infer a score from their historical priority. Assess these findings in a dated revision before its next approval.

## Approval and linkage

Approved versions retain immutable plan data and the applicable KPI definitions. Ordinary readers receive effective approved versions; confidential SWOT and draft access are enforced on the server. Relevant employees can read approved department plans to select a parent for their own proposed contribution.

Raw SWOT is available to management and the assessment's explicitly selected owners, coordinators and contributors. HR membership alone does not grant access to confidential SWOT or company drafts. Company editing requires management or an explicit plan-coordinator assignment.

Each company goal belongs to one objective. Every newly approved objective requires an eligible reviewed SWOT source. Sources pin `{ documentId, findingId, version }`, so a later assessment revision cannot change an objective's original basis. `NEEDS_CHECKING` findings cannot support objective approval. Sources and source rationale are redacted from current and historical responses when the actor cannot access the source assessment.

Department goals reference an approved company goal or explain an essential ongoing department responsibility. They retain their own measure, baseline (or unavailable explanation), target, unit, accountable person and dates. Team/position/individual goals reference the appropriate approved department goal or identify an ongoing role responsibility. Any supplied parent must be valid even when an ongoing-responsibility explanation is present. Child dates remain within parent-goal dates, and KPI/action dates remain within their contribution goal. Department targets and action completion never replace company achievement.

An approved goal must have delivery actions, linked shared actions, or an explanation of why it needs no separate action plan. KPI assignments have their own accountable owner, data provider and verifier. Overlapping duplicate assignments of the same measure are flagged for review instead of silently double-counting targets. Adapting a KPI or KRA creates a distinct reusable definition with `adaptedFromId`; it does not overwrite the original definition or an approved assignment. `SAVE_DEFINITION` accepts `adaptedFromId` for the KPI, or `adaptedKraFromId` plus an empty `kraId` and distinct `kraName` when adapting its responsibility area.

An incomplete objective may be saved without a pillar. Its stable ID exists immediately; its permanent code is assigned on first pillar selection and retains that originating pillar even if alignment changes later. Existing legacy codes are preserved.

New audit entries retain the actor's account name and before/after changes. The UI formats timestamps in the organisation's timezone. Confidential source links/details must be redacted from history as well as current and approved plan views. Historical entries recorded before field-level auditing was introduced retain their original information; no fictional before/after values are reconstructed.

Shared actions remain owned by their originating department plan. Personal plans store references and the approved-plan handover resolves those references using their pinned versions. Later changes in a department draft do not silently replace a person's approved commitment. Result entry and live action progress remain the responsibility of the shared execution module; planning does not create an independent progress register.

Position and team membership are approved snapshots. A planner explicitly refreshes current holders/members in a draft revision; transfers never silently rewrite earlier commitments. A former holder can read only their entitled approved versions, not the replacement holder's plan.

## Evidence and backups

Evidence is stored separately in `LexPlanningEvidence`, scoped to the workspace and finding. Uploads allow up to five files per unreviewed finding, each at most 500 KB. Reviewed evidence is preserved. Downloads are attachments with `nosniff`, not public URLs.

Backup exports include confidential SWOT and evidence. Only management may export/restore them. Exports are signed using a domain-separated HMAC derived from `JWT_SECRET`, bound to the organisation, and limited to 16 MB. Changing that secret invalidates signatures on earlier exports; retain an appropriate operational backup strategy. Restore must preserve existing approved versions and audit history and must not remove existing records. The backup UI is not a replacement for database disaster recovery.

## Dependency boundaries

- **Area 01:** fixed pillars reuse the shared contract. Approved company direction uses the providing service when available; its implementation is currently a scaffold on this branch. Area 03 does not implement direction editing or query its tables directly.
- **EMS:** existing department/employee IDs, job titles and sections are reused, with source and refresh metadata. A stable position master (including vacancies) is not currently implemented by EMS on this branch. The position contract and planning flow are ready for that provider, and the UI explicitly explains why position selection is unavailable until then.
- **Area 02:** the calendar adapter consumes the approved provider when available; this branch's Area 02 implementation remains a scaffold. The fallback reads the existing work calendar, holidays and organisation timezone. Assignment schedules preserve their calendar/settings with the approved plan. Every 14 days and twice monthly are deliberately different; non-working daily dates are not scheduled, and missing targets are never converted to zero. Annual targets are not divided automatically. Fallback calendar data is labelled as such, not presented as an approved Area 02 calendar.
- **Area 07:** the shared library adapter uses the approved provider when available. On this branch the provider remains a scaffold, so the existing single workspace catalogue and labelled reference examples remain available. Definitions and adaptation lineage are separate from assignment targets and frequencies; approved versions snapshot their definitions. Do not build a second library during downstream integration.
- **Areas 04–07:** `/approved` supplies planning commitments and stable references. Result entry, result verification, operational execution, reviews and reporting are not implemented here.

## Migration and verification

Schema: `packages/db/prisma/schema/lex-03-performance-planning.prisma`.

Migration: `packages/db/prisma/migrations/20261103104500_lex_performance_planning/migration.sql`. It creates this area's workspace/evidence tables. Apply only the reviewed scoped migration to the intended environment, retaining applied migration history. Do not reset the database or blindly deploy unrelated pending migrations. Regenerate/build the `db` package after schema changes before building the API.

From `apps/api`, run the focused rules suite:

```powershell
pnpm.cmd exec jest planning.rules.spec.ts --runInBand
```

The rules suite covers access, approved-version visibility, source eligibility/pinning, parent links, child dates, reporting periods, malformed targets and missing-versus-zero values. The completion suite exercises command workflows against isolated transactional persistence, including shared action identity, revisions, tenant isolation, stale writes, department responsibilities, KPI adaptation and audit changes. Calendar tests cover schedule boundaries and working days. These checks do not replace the shared-system execution/result/review/report acceptance exercise.

```powershell
pnpm.cmd exec jest --runInBand --testPathPatterns=performance-planning
```

No additional database migration is needed for these fields: they extend the existing versioned planning JSON aggregate. Older approved snapshots remain readable and immutable; new validation applies when submitting/approving a new version.
