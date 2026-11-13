# Area 03 — Performance Planning & Alignment

This module owns SWOT assessments, measurable company objectives, department goals, team/individual goals, and approvals, measured results, independent verification, management reviews and action progress. The workbook flow is **reviewed SWOT → measurable company objective → department goals**. Each department goal links directly to a company objective and has its own KPI, baseline, target, unit, owner and deadline; several departments can contribute distinct goals to the same company objective. There is no required department-objective step or separate company-goal record. Individual goals extend that flow by linking to approved department goals; authorised direct company-objective links remain supported. Existing records, generated IDs and approved versions are retained. It uses the existing Leadership Excellence shell, authentication and organisation module guards. EMS master records are not copied.

## Entry points

Frontend routes are under `/leadership-excellence/performance-planning`:

| Route | Purpose |
| --- | --- |
| `/objectives` | SWOT by pillar, review decisions and measurable company objectives |
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
- People plans can be drafted before their department plan exists. They retain their real EMS department; a same-period department plan is a readiness prerequisite for team/position plans, but not for an individual plan that links directly to a company objective. Linked contributions require an authorised approved parent; essential ongoing responsibilities remain supported.
- `SAVE_SETTINGS`: update plan metadata and permitted access settings.
- `SAVE_ITEM` / `DELETE_ITEM`: manage a finding, objective, goal, assignment or action. Reviewed or referenced items cannot be deleted.
- `SAVE_GOALS`: atomically save up to 50 individual contribution blocks plus `removedIds`; incomplete and empty drafts are allowed.
- `APPROVE_ITEM` / `REVISE_ITEM`: approve one company objective or department goal, or open its dated revision. Approval needs `{kind, id, evidenceChecked: true}`. Revision needs `{kind, id, reason, effectiveDate}`. Other drafts remain editable.
- `SAVE_RESULT`, `VERIFY_RESULT`, `SAVE_REVIEW`, `UPDATE_ACTION_PROGRESS`: record separately measured outcomes, independent checks, management decisions and action evidence.
- `SAVE_FINDINGS`: save up to 50 separate finding blocks atomically, each with its own ID and code. `REVIEW_FINDING` records a decision (`REVIEW_FINDINGS` applies the same checks atomically to up to 50 distinct IDs) and, when ready, an immutable reviewed snapshot; `REOPEN_FINDING` requires a reason before editing a reviewed finding. Review confirmation requires the designated approver and an explicit acknowledgement that supporting evidence was checked.
- `LINK_ACTION` / `UNLINK_ACTION`: attach or detach a reference to an approved department action in a contribution plan. The reference keeps the department document ID, original action ID and approved version; it does not create another action.
- `CONSIDER_PILLAR`: record that a fixed pillar has been assessed; empty quadrants are allowed.
- `CONSIDER_ALL_PILLARS`: confirm all six fixed pillars together in one editable SWOT assessment. Existing confirmations stay marked; repeated requests never toggle them off. The audit records the newly considered pillars. Later finding edits still clear consideration for their affected primary/shared pillars, requiring renewed confirmation.
- `SAVE_DEFINITION`: create or adapt a reusable KPI definition under an existing/new KRA without overwriting an existing definition.
- `SUBMIT`, `APPROVE`, `RETURN`: one designated authorised approver; finalisation validates completeness.
- `REVISE`: open a draft with a reason and effective date while preserving approved versions.
- `ACKNOWLEDGE`: acknowledge the employee's own effective approved individual plan.

`LexPlanningWorkspace` stores one versioned JSON aggregate per organisation. All planning screens operate on this state. Commands use a database transaction and compare-and-swap on `revision`; a stale write returns `409` rather than overwriting another editor. Refresh the register and reconcile before retrying. This is an aggregate persistence model, not a new department/employee master.

Draft fields may be incomplete. Referential checks, tenant membership, valid supplied values and the minimum SWOT finding fields still apply when saving. Full readiness validation runs before submission/approval. Missing numeric data remains `null`, distinct from zero.

`CREATE_PLAN` accepts paired ISO `startDate`/`endDate` values spanning one or multiple years. A full calendar year keeps the existing four-digit `cycle`; other periods use `YYYY-MM-DD..YYYY-MM-DD`. Passing only a supported cycle derives its exact boundaries. Parent/source links must use the same cycle, and duplicate prevention remains per organisation, scope and cycle. New display codes use compact years while the full period stays in the cycle key. Multi-year plans are supported; an individual KPI assignment is limited to 732 generated target periods and must still respect its reporting calendar.

SWOT findings use an independent integer `weightage` from 1 to 10. The server derives `priority`: 1–3 `LOW`, 4–7 `MEDIUM`, 8–10 `HIGH`, ignoring any priority sent by the client. A draft may leave weightage `null` (Not assessed); submission/approval requires every finding to have a valid score and matching derived priority. Display scored findings from highest to lowest, with unassessed findings last. Existing approved snapshots without weightage remain unchanged; do not infer a score from their historical priority. Assess these findings in a dated revision before its next approval.

## Approval and linkage

Approved versions retain immutable plan data and the applicable KPI definitions. Ordinary readers receive effective approved versions; confidential SWOT and draft access are enforced on the server. Relevant employees can read approved department plans to select a parent for their own proposed contribution.

Raw SWOT is available to management and the assessment's explicitly selected owners, coordinators and contributors. HR membership alone does not grant access to confidential SWOT or company drafts. Company editing requires management or an explicit plan-coordinator assignment.

Each company objective is the measurable commitment. Programme fields include a short `title`, a separate measurable `result`, one or more QCDSMT selections in the canonical `alignments` array (Q, C, D, S, M, T, plus Business focus stored as `OTHER`), `measure`, its counting `definition`, `baseline`, `baselinePeriod`, `target`, `unit`, `direction`, `dataSource`, free-text `reviewFrequency`, `ownerId`, `endDate`, `approach`, `selectionReason` and `guardrails`, plus its pillar, priority, weightage and reviewed sources. New programme approval requires a measured baseline, not an unavailable-value explanation. Zero is valid; missing values are never inferred from a department result or legacy linked goal. A legacy single `alignment` is accepted only when the `alignments` array is absent. An explicitly empty array remains empty and cannot pass approval. Business focus may be combined with any QCDSMT selections and requires `otherBusinessFocus` text at objective approval. SWOT findings use the same canonical multi-selection and require that text before review. Incomplete drafts remain allowed. The UI removes only the word Other; internal `OTHER` codes and historical approved snapshots remain unchanged. Older API clients retain their existing draft and whole-plan workflow. A company plan needs no separate company-goal rows.

`itemApprovals` records each current item lock and its canonical approved version. Each card approval appends an immutable cumulative snapshot with `approvedItem: {kind, itemId}` identifying the row actually approved in that version. Other draft rows are never included as approved data. Publication applies only each item's own effective approval, so approving a different row cannot expose a future-dated revision early. Results and parent choices stay pinned to the item's actual approval version rather than acquiring an unrelated later snapshot number.

Every newly approved objective requires an eligible reviewed SWOT source. The same reviewed finding may support multiple company objectives; each objective has its own distinct result and independently version-pinned source links. Reusing a finding does not duplicate the finding record, reserve it for one objective, or update another objective automatically. A repeated identical source reference within one objective is still rejected. A department/individual goal still selects exactly one approved parent objective or goal. Sources pin `{ documentId, findingId, version }`, so a later assessment revision cannot change an objective's original basis. `NEEDS_CHECKING` findings cannot support objective approval. Sources and source rationale are redacted from current and historical responses when the actor cannot access the source assessment. Objective priority is entered as an integer from 1 to 10; its manually entered weightage must be between 1 and that pillar's allocation, with up to two decimal places. Allocations are OPX 30%, PEX 20%, CMX 20%, and LEX/SGEX/FPEX 10% each. Objectives within every represented pillar must total its exact allocation at approval; unused pillars do not force additional objectives.

Department programme goals select an approved company objective and retain their own server-generated `goalNo` and business `code`, KPI `measure`, counting `definition`, measured `baseline`, `baselinePeriod`, `target`, `unit`, `direction`, owner, due date, `source` and `frequency`. Approval requires a real baseline. Saving the first valid parent link assigns the next goal number for that parent identity, department and planning period. Parent versions share a sequence. Manual client goal numbers, codes and department tokens cannot overwrite this identity. The code combines the parent objective code, a stable department token and `G01`, `G02`, etc.; sequences may continue beyond 99. EMS currently exposes no department code, so the fallback token uses its name and ID suffix, never a new department master. Optional JSON high-water counters are seeded from current and approved records and retained after draft deletion or reparenting, so used numbers are not recycled. Ordinary edits and dated revisions retain the saved number/code; approved goals cannot change or clear their parent identity. An unapproved draft moved to another parent receives a number in the new parent's scope. Unlinked incomplete drafts remain allowed. Allocation uses the existing atomic workspace transaction and revision check; rejected saves do not consume a number.

New programme objectives are available to any authorised department in the same organisation and planning period; contributing-department selection is not required. Legacy direction-only objective/goal references keep their original contribution restrictions. Individual contributions may reference approved company objectives or department goals (including authorised cross-department goals); each keeps its own measurable result. The individual owner is the EMS employee selected for that plan. No separate legacy KPI assignment wizard or delivery action is required before programme approval. Actions can be added after department-goal approval without altering its immutable snapshot.

Parent references use `{ documentId, goalId, version, itemKind? }`. `itemKind: "OBJECTIVE"` explicitly identifies a company objective; the compatibility field `goalId` contains that objective's ID. `itemKind: "GOAL"`, or a missing `itemKind` on a historical link, identifies a goal. Resolution is against the exact approved version and checks period, scope, contributing departments and access. The server's objective-to-goal-shaped projection is read-only and never inserts a duplicate goal. New UI selections use company objectives; existing legacy company-goal links remain editable and older authorised API clients retain their compatibility path.

New company approvals have `companyPlanningModel: "MEASURABLE_OBJECTIVES"`. Their approved `data.objectives` contain the commitments and `data.goals` is empty, so unvalidated legacy goal rows cannot appear as newly approved parents. Existing linked company-goal rows are preserved in optional `legacyCompanyGoals` for history and draft revisions; this archive is omitted from read-only employee views and the `/approved` handoff. Earlier approved versions and their pinned goal links remain unchanged. Measures from one or multiple legacy goals are never silently selected, summed or copied into an objective.

Legacy department/people plans retain their assignment and action-readiness checks. The programme flow captures its measurement fields directly and permits subsequent actions without adding a second goal or KPI master. KPI assignments have their own accountable owner, data provider and verifier. Overlapping duplicate assignments of the same measure are flagged for review instead of silently double-counting targets. Adapting a KPI or KRA creates a distinct reusable definition with `adaptedFromId`; it does not overwrite the original definition or an approved assignment. `SAVE_DEFINITION` accepts `adaptedFromId` for the KPI, or `adaptedKraFromId` plus an empty `kraId` and distinct `kraName` when adapting its responsibility area.

An incomplete objective may be saved without a pillar. Its stable ID exists immediately; its permanent code is assigned on first pillar selection and retains that originating pillar even if alignment changes later. Existing legacy codes are preserved.

New audit entries retain the actor's account name and before/after changes. The UI formats timestamps in the organisation's timezone. Confidential source links/details must be redacted from history as well as current and approved plan views. Historical entries recorded before field-level auditing was introduced retain their original information; no fictional before/after values are reconstructed.

Shared actions remain owned by their originating department plan. Personal plans store references and the approved-plan handover resolves those references using their pinned versions. Later changes in a department draft do not silently replace a person's approved commitment. The authorised programme flow stores dated measurements, verification, action progress and management-review decisions in the same scoped workspace aggregate. This does not write to or replace another functional area's tables. Future integration should map these IDs and versions rather than duplicate records.

Position and team membership are approved snapshots. A planner explicitly refreshes current holders/members in a draft revision; transfers never silently rewrite earlier commitments. A former holder can read only their entitled approved versions, not the replacement holder's plan.

## Programme outcomes and actions

`SAVE_RESULT` takes `{itemId, version, periodStart, periodEnd, actual, numerator?, denominator?, source, notes}` on an approved company/department/individual document. It resolves the exact approved snapshot and validates scope, dates, values and overlapping periods. Percentage counts must be whole numbers, with a positive denominator and numerator between zero and total. Missing values remain missing; a measured zero is valid.

Measurements start PENDING. `VERIFY_RESULT {id, decision: "VERIFIED" | "REJECTED", note}` requires the designated approver and rejects self-verification. The evidence remains dated and version-pinned. Verified results cannot be overwritten; rejected measurements remain visible when recording a corrected result.

`SAVE_REVIEW {itemId, version, decision: "INVESTIGATE" | "SUSTAIN" | "REVISE", note, nextReviewDate}` records a management decision. Investigation may be recorded without a result; SUSTAIN requires the company's own latest verified measurement meeting its directional target. Department, individual and completed-action counts never replace company achievement. A REVISE decision does not silently change the approved target; use the authorised revision command.

`SAVE_ITEM` actions can pin an approved department goal via `parent`, or one reviewed finding in their SWOT document via `sources`, without inventing an objective. Direct SWOT actions retain assessment confidentiality. `UPDATE_ACTION_PROGRESS` appends PLANNED/IN_PROGRESS/COMPLETED events, with completion evidence mandatory. `programmeActions` exposes authorised post-approval actions without modifying prior approved goal snapshots. `programmeActionProgress`, `programmeResults` and `programmeReviews` are filtered by the actor's approved-record access.

## Evidence and backups

Evidence is stored separately in `LexPlanningEvidence`, scoped to the workspace and finding. Uploads allow up to five files per unreviewed finding, each at most 500 KB. Reviewed evidence is preserved. Downloads are attachments with `nosniff`, not public URLs.

Backup exports include confidential SWOT and evidence. Only management may export/restore them. Exports are signed using a domain-separated HMAC derived from `JWT_SECRET`, bound to the organisation, and limited to 16 MB. Changing that secret invalidates signatures on earlier exports; retain an appropriate operational backup strategy. Restore must preserve existing approved versions, measurements, verification, management reviews, progress events and audit history and must not remove existing records. The backup UI is not a replacement for database disaster recovery.

## Dependency boundaries

- **Area 01:** fixed pillars reuse the shared contract. Approved company direction uses the providing service when available; its implementation is currently a scaffold on this branch. Area 03 does not implement direction editing or query its tables directly.
- **EMS:** existing department/employee IDs, job titles and sections are reused, with source and refresh metadata. A stable position master (including vacancies) is not currently implemented by EMS on this branch. The position contract and planning flow are ready for that provider, and the UI explicitly explains why position selection is unavailable until then.
- **Area 02:** the calendar adapter consumes the approved provider when available; this branch's Area 02 implementation remains a scaffold. The fallback reads the existing work calendar, holidays and organisation timezone. Assignment schedules preserve their calendar/settings with the approved plan. Every 14 days and twice monthly are deliberately different; non-working daily dates are not scheduled, and missing targets are never converted to zero. Annual targets are not divided automatically. Fallback calendar data is labelled as such, not presented as an approved Area 02 calendar.
- **Area 07:** the shared library adapter uses the approved provider when available. On this branch the provider remains a scaffold, so the existing single workspace catalogue and labelled reference examples remain available. Definitions and adaptation lineage are separate from assignment targets and frequencies; approved versions snapshot their definitions. Do not build a second library during downstream integration.
- **Areas 04–07:** `/approved` supplies planning commitments and stable references. This programme now stores its own dated measurements, verification, delivery progress and management decisions to complete the approved workflow. These records remain scoped to Area 03; they do not implement or write to the other areas' shared execution, reporting or intelligence modules.

## Migration and verification

Schema: `packages/db/prisma/schema/lex-03-performance-planning.prisma`.

Migration: `packages/db/prisma/migrations/20261103104500_lex_performance_planning/migration.sql`. It creates this area's workspace/evidence tables. Apply only the reviewed scoped migration to the intended environment, retaining applied migration history. Do not reset the database or blindly deploy unrelated pending migrations. Regenerate/build the `db` package after schema changes before building the API.

From `apps/api`, run the focused rules suite:

```powershell
pnpm.cmd exec jest planning.rules.spec.ts --runInBand
```

The rules suite covers access, approved-version visibility, source eligibility/pinning, explicit objective/goal parent kinds, legacy version compatibility, child dates, reporting periods, malformed targets and missing-versus-zero values. The completion suite exercises command workflows against isolated transactional persistence, including approval of measurable company objectives without duplicate goals, direct department/individual links, legacy archives, shared action identity, revisions, tenant isolation, stale writes, department responsibilities, KPI adaptation and audit changes. Calendar tests cover multi-year schedule boundaries and working days. These checks do not replace the shared-system execution/result/review/report acceptance exercise.

```powershell
pnpm.cmd exec jest --runInBand --testPathPatterns=performance-planning
```

No additional database migration is needed for these fields: they extend the existing versioned planning JSON aggregate. Older approved snapshots remain readable and immutable; new validation applies when submitting/approving a new version.
