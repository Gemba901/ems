# Strategic Objectives & Linked Goals — F1–F3

Foundation for **Leadership Excellence > Performance Planning & Alignment** in
Gemba PMS / BEES. Uses the repository's Next.js App Router, React, TypeScript,
Tailwind and Lucide stack. No new package, backend endpoint or database table.

## Run

From `D:\ems` in PowerShell:

```powershell
pnpm.cmd --filter web dev
```

Open `http://localhost:3000/leadership/strategic-objectives` (or the port shown by
Next.js if 3000 is occupied). If the web dev server is already running, open it
without starting a second copy. You can also open **Leadership Excellence →
Performance Planning → Objectives & Company Goals** from the dashboard/sidebar.
The module's overview links to the same prototype; its objectives entry route
redirects to the existing register instead of creating a second register. A back
link returns to Leadership Excellence. Other unfinished areas show a Coming soon
message. The dashboard retains the single upstream Leadership Excellence card.

F2 adds the working **Create Objective** form and **Edit draft** within the single
register. Title, meaning, primary pillar, QCDSMT, owner and planning period can
all be left incomplete when saving. Saved drafts appear in the same register,
highlighted and focused, with a success message. Editing keeps the same record
and code.

F3 adds **Add Goal** within each objective and **Edit goal draft**. The form has a
fixed linked objective, generated code, result statement, measure, optional
baseline, target, unit, owner, deadline, and contributing departments. Incomplete
drafts save without finalisation checks. New and edited goals stay in the same
register under their original objective; saving focuses the goal.

SMART readiness updates from the shared rules. Specific, Achievable and Relevant
require human confirmation; Measure and Time-bound have automatic checks.
Material edits clear old confirmations. Five optional explanation boxes are
collapsed by default. A 5/5 readiness result is not approval: the linked objective
must be approved, contributing departments selected and all finalisation checks
satisfied. Approval and revision forms belong to F4.

These four exact prototype routes render without the existing API session
bootstrap. `contexts/SessionProvider.tsx` still uses the original session flow
for every other route. Only synthetic fixtures are reachable through the demo.
Remove the narrow exception when real authentication/data are connected.

## Structure and contracts

- `types.ts`: shared records, dependencies and Promise-based service contract.
- `rules.ts`: validation, SMART readiness, code allocation, permissions,
  approved-version selection, approval locks and revision creation.
- `stubs/`: six read-only pillars, eight departments, twelve employees with
  department/position, and two planning periods. Ownership remains with Rodgers,
  Kendi's EMS, and Performance Rules & Calendar respectively.
- `seed.ts`: three objectives with five goals: LEX Draft, OPX Approved,
  FPEX Revised. Revised samples retain their prior approved versions.
- `index.ts`: one canonical in-memory store per mounted shell. Screens use
  `createStrategicObjectivesService()`. Replace this composition point with an
  API adapter implementing `StrategicObjectivesService` after approval.
- `routes.ts`: the four preview routes and their exact-match session exception.
- `components/strategic-objectives/ObjectiveForm.tsx`: create and continue drafts
  through the service contract. Uses `/new?objectiveId=...` for editing; there is
  no separate draft register. Cancel, module navigation and role changes confirm
  before discarding unsaved entries; browser reload also prompts when dirty.
- `components/strategic-objectives/GoalForm.tsx`: create/edit goal drafts through
  `saveGoal()` at `/goals/new?objectiveId=...`, adding `&goalId=...` for an edit.
  Rejects missing/mismatched references and locked goals; no re-parenting control.
  An approved objective may receive a new draft goal without altering its own
  approved data. Drafts under a pending objective revision remain unapproved.

Service operations:

```ts
getSession();
setDemoRole(role);
getPillars();
getDepartments();
getEmployees();
getPlanningPeriods();
getObjectives(); // The one register, with goals nested under their objective.
createObjective(input?);
saveObjective(id, input, expectedVersion);
approveObjective(id, expectedVersion);
saveGoal(objectiveId, input, id?, expectedVersion?);
approveGoal(id, expectedVersion);
reviseObjective(id, reason, effectiveDate);
reviseGoal(id, reason, effectiveDate);
getApprovedCompanyGoals(departmentId?);
```

All operations return Promises. Draft saves do not run finalisation checks.
Reads and writes copy their inputs/outputs so callers cannot mutate the store by
changing a returned object. IDs are generated once; revisions retain the same ID.
Codes cannot be supplied or edited through the write contract.

`getApprovedCompanyGoals()` is the future Department Goals handoff: it projects
effective approved goals with the same company goal ID and objective ID. An
optional department ID filters by contribution membership. It does not create
department goal records or a second register. The same company goal may be read
by several contributing departments without being copied into this store.

## Demo assumptions

1. This is one synthetic company plan. Browser reload or leaving/remounting the
   module resets it. No localStorage, cookies, real tenant data or network calls
   are used by this module. Next.js navigation/rendering still uses its normal
   framework requests. No live EMS identities or records are changed.
2. CEO / Authorised Leadership drafts and proposes revisions. One designated
   Approver approves but does not edit. Employee / HOD is read-only. The switcher
   simulates permissions; real server-side authorisation is deferred.
3. `Revised` means a pending amendment, not a second approved record. Employees
   read the most recent approved version whose effective date has arrived;
   unapproved and future-effective changes do not replace that version.
4. Incomplete drafts receive unique temporary codes such as `OBJ-DRAFT-001`.
   First approval assigns `OBJ-OPX-2026-001` / `GOAL-OPX-2026-001` using the
   selected planning period. Final codes and IDs remain stable across revisions.
   Code allocation in this mock is synchronous; the future API must enforce
   uniqueness transactionally at company scope.
5. Goals are always created within one existing objective, including incomplete
   drafts. There are no orphan goals and no re-parenting of an existing goal.
6. One or more QCDSMT tags and contributing departments are required on
   finalisation. Baseline stays optional. Numeric goals may target zero; missing
   values remain `null`. No company achievement values are calculated here.
7. SMART explanation text is optional. Specificity, achievability and relevance
   need explicit human confirmation; the service cannot infer these from prose.
   Measure/target/unit and deadline checks are automatic. Material goal edits
   clear old confirmations unless fresh confirmations are explicitly provided.
8. Sample periods are calendar years 2026 and 2027. Date-only effective checks
   currently use the mock clock's UTC date. Confirm the shared organisation
   timezone policy with Performance Rules & Calendar before API integration.

## Verify

```powershell
node --import ./packages/db/node_modules/tsx/dist/loader.mjs --test apps/web/tests/strategic-objectives.test.ts
pnpm.cmd --filter web exec eslint app/leadership/strategic-objectives components/strategic-objectives services/strategic-objectives contexts/SessionProvider.tsx tests/strategic-objectives.test.ts
pnpm.cmd --filter web exec tsc --noEmit --incremental false
```

Manual checks:

1. Open Guide, then the register: Leadership sees three objectives and five goals.
2. Switch to Employee / HOD: only two approved objectives and three approved goals
   appear; the finance goal shows the approved target of 50 days, not the pending
   45-day proposal. Create Objective is unavailable.
3. Switch to Approver: drafts/revisions reappear but creation remains unavailable.
4. Return to Leadership and open Create Objective. Save a completely blank draft:
   expect a success message, four objectives, and an Untitled objective with a
   unique draft code. No goals are created implicitly.
5. Click Edit draft on that record. Fill the six editable fields and save. The
   same objective is updated, the register still has four objectives, and audit
   history records who saved it and when. Code remains read-only.
6. Try cancelling or switching roles with unsaved entries. Dismiss the prompt to
   keep editing, or confirm to discard. Reader and Approver cannot access the
   form, even by directly opening `/new?objectiveId=demo-obj-lex`. An Approved
   objective (`demo-obj-opx`) cannot be edited through a crafted URL either.
7. Version history is collapsed until requested. At narrow mobile widths the
   navigation wraps and goal facts stack without horizontal page overflow.
8. Changes disappear on reload. No calls to `/api` should be
   made while opening these demo routes, even when the real API is offline.

Not included: KPI results, department/employee goals, dependency-master CRUD,
production authentication, backend persistence, or approval/revision forms.

F3 manual checks:

1. Under any objective choose Add Goal. Linked objective and goal code are
   read-only. Saving blank creates one Untitled goal under that objective.
2. Edit that draft and enter a result, measure, target `0`, unit, owner, an
   in-period deadline and two departments. Leave baseline and explanations blank.
   Confirm the three human judgements: SMART readiness becomes 5/5, status stays
   Draft. Save and reopen; all fields and the same goal code are retained.
3. Change a material field: all three confirmations clear. Enter a deadline
   outside the objective's period: Time-bound needs attention. Saving is still
   allowed. Clearing a target saves a missing value, never zero.
4. Open optional SMART explanations and add notes; notes do not clear the human
   confirmations. They are saved and reopen on edit, but the section starts closed.
5. Cancel, navigate away or switch roles with edits: dismissing the confirmation
   retains inputs. Repeated clicks on Save Draft create one record only.
6. Employee / HOD sees only approved goals. Approver can read drafts but cannot
   open editing controls. Direct URLs cannot edit Approved/Revised goals or move
   a goal to a different objective.
7. Check the form at 320px/390px and desktop widths. Reload resets this demo to its
   three objectives and five goals. No real API calls are made on the form route.
