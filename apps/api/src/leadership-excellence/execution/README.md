# Area 04 — Department & Employee Performance Execution

Area 04 reads approved, effective commitments from Area 03 through the internal
`PerformancePlanningService.getExecutionSource()` contract. It does not create or
copy plans, objectives, goals, assignments, definitions, targets or calendars.
Per-item approvals use their own canonical snapshot, including the definition
and calendar approved with each assignment.

## HTTP API

All endpoints use the existing tenant context, access-token, role and Leadership
Excellence module guards. Responses use `Cache-Control: no-store`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/leadership-excellence/execution/workspace` | Role-scoped approved goals, KPI periods, actions, results and support requests |
| POST | `/leadership-excellence/execution/commands` | Save execution updates with optimistic concurrency |
| GET | `/leadership-excellence/execution/submissions` | Existing submitted-result queue scoped to the assigned verifier |

The web app uses its existing `/api/` proxy prefix. Area 04 reads its
approved goals, assignments, targets and actions from the workspace endpoint.
The additional Area 05 integration routes and alert-follow-up creation are not
exposed. The internal verification boundary remains available for the existing
result lifecycle; there is no verification command in the Area 04 UI.

Every command has `{ "expectedRevision": 0, "action": "...", "payload": {...} }`.
Use the revision returned by the workspace that opened the editor. A conflict
preserves the saved data; the client must retain entries and refresh before retry.

### KPI result entry

`SAVE_RESULTS` and `SUBMIT_RESULTS`:

```json
{
  "assignmentKey": "<document-id>/<assignment-id>/v1",
  "rows": [
    {
      "periodId": "2026-01-01/2026-01-01",
      "inputA": 6000,
      "inputB": 100,
      "note": "Verified against production register",
      "evidence": "Production register, page 10"
    }
  ]
}
```

Only the approved data provider can enter results. Inputs remain nullable in a
draft; submission requires all source figures. `DIRECT` uses input A;
`RATIO` calculates A/B; `PERCENT` calculates A/B × 100. A zero or negative
denominator is rejected. Future/non-working periods cannot receive observations;
the current reporting period can be drafted but submitted only after its end.

`entryPeriodIds` is calculated from full approved version history, before role
filtering, so reassignment cannot grant a former provider access to new periods.
The first approval can cover a historical planning year. Later revisions apply
from their effective dates. Existing observations retain their original version;
overlapping observations are rejected even across reporting-frequency changes.

Submitted rows are locked. The existing internal service method
`verify(user, expectedRevision, resultId, 'VERIFY' | 'RETURN', note)` verifies or
returns the same stored row. It enforces the assigned verifier and rejects
self-verification. There is deliberately no Area 04 verification command.
A correction requires a reason and retains `official` until re-verification.
A verification UI is outside this Area 04 workspace.

### Shared delivery actions

`UPDATE_ACTION` payload:

```json
{
  "actionKey": "<document-id>/action/<action-id>",
  "status": "IN_PROGRESS",
  "progress": 30,
  "note": "First machine setup checked",
  "evidence": "",
  "delayReason": ""
}
```

Allowed update statuses: `IN_PROGRESS`, `BLOCKED`, `PENDING_CHECK`. The existing
single `ownerId` is the only person who can update the action. A blocked action
requires a delay reason. Completion check requires 100%, a note and evidence.

`CHECK_ACTION` uses `{ actionKey, decision: 'COMPLETE' | 'RETURN', note }`.
Management or the owning HOD can check an action, but cannot self-check an action
they own. Action progress never changes the KPI achievement or verified actual.
Actions created after goal approval are included only with an exact approved,
effective parent. Existing Area 03 action progress appears as historical fallback.

### Support

`CREATE_SUPPORT` uses
`{ goalKey, actionKey?, title, request, assignedToId, dueDate }`.
The goal must be approved and available to the requester; optional action must
belong to that goal. The support person comes from the same organisation's EMS.

`UPDATE_SUPPORT` uses `{ id, status, response }`. The assigned support person or
authorised management may save `IN_PROGRESS` or `RESOLVED` updates;
requester/management closes a resolved request with `CLOSED`.
API-provided `canRespond`/`canClose` flags control the UI.

`ACKNOWLEDGE_SUPPORT` uses `{ id }`. Only the assigned recipient can accept a
request. The server saves `acknowledgement: { at, by, name }`, adds a history
event and moves an open request to `IN_PROGRESS`. Repeated acceptance preserves
the first timestamp and identity. Opening a request does not acknowledge it.
The recipient's first saved response also records acceptance for compatibility;
a management response never counts as the recipient's acknowledgement.

`canAcknowledge` controls the Accept request button. Elapsed acceptance time is
the difference between `createdAt` and `acknowledgement.at`; clients cannot set
either acceptance identity or time. Acknowledgement is independent of resolving
or closing the request. Older records without it remain unrecorded; timestamps
are not inferred from their status or fabricated during reads.

The workspace returns these fields to authorised senders, recipients and
existing scoped viewers. The support screen shows sent/received counts,
pending/accepted counts, and a sender-to-recipient summary within the selected
planning scope. The existing execution JSON aggregate persists this additive
data, so no new table or migration is required.

## Storage and migration

`LexExecutionWorkspace` stores only execution rows and their history per tenant.
Its revision and tenant key prevent accidental overwrite/cross-tenant updates.
Both planning and execution mutations lock the planning aggregate first; execution
also checks the source revision under that lock before writing. A failed batch is
atomic. Install migration `20261118090000_lex_execution_workspace` before serving
these endpoints and regenerate/build the `db` package.

Rebuild `db` and the API after installing execution storage. No verification
decision is automatically seeded.

Evidence currently supports text/document references. Binary evidence uploads,
notifications, external machine feeds and the Area 05 verification UI are separate
integrations; no browser-local data or mock records are used by these APIs.

## Focused checks

```powershell
pnpm --filter api exec jest --runInBand --runTestsByPath src/leadership-excellence/execution/execution.service.spec.ts src/leadership-excellence/execution/execution-handoff.spec.ts
```

These tests use isolated in-memory repositories/fixtures and do not connect to
or modify a live organisation database.
