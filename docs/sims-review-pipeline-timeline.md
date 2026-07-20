# SIMS Status & Decision Pipeline — Build Timeline

Source: "SIMS – Status and Decision Guide" (proposed final pipeline, reviewed 2026-07-18).
This is a plan to work from tomorrow, not a build — check items off as you go.

## What the guide actually changes vs. what exists today

Current model (`packages/db/prisma/schema.prisma:426-455`, `apps/api/src/sims/sims.service.ts:19-25`):

- `SuggestionStatus`: `UNDER_REVIEW`, `ON_HOLD`, `SELECTED_FOR_SGA`, `APPROVED_FOR_IMPLEMENTATION`, `REJECTED` (5 values). A suggestion is created straight into `UNDER_REVIEW` — there's no "submitted but not opened yet" state.
- `ImplementationStatus`: a *second*, separate field (`WORK_IN_PROGRESS`, `IMPLEMENTED`, `SHIFTED_TO_SGA`, etc.) that tracks progress once approved.
- Only one "approved" bucket. No distinction between a simple workplace correction and a Daily Gemba Kaizen.
- The frontend board (`apps/web/app/sims/page.tsx:36-53`) currently mislabels `APPROVED_FOR_IMPLEMENTATION` as **"Implemented"** in `STATUS_CONFIG` — that's already a small existing bug, not something the guide introduces.

The guide's 8-status flow needs four real changes:

1. **A true "Waiting for Review" state** distinct from "Under Review by HOD" — submitted vs. opened.
2. **Two approval sub-types** instead of one — Workplace Suggestion & Correction vs. Daily Gemba Kaizen — each requiring different structured fields before the HOD can save the decision.
3. **"Implemented" as a first-class, terminal status** reachable from any of the three approved paths (Workplace Correction, Daily Kaizen, SGA), not just a sub-field.
4. **Required structured fields per decision** (action/responsible/support/target date; owner/support team/target date/expected result/evidence; problem statement/team/target/timeline/review dates; hold reason/responsible/review date/next action) — none of this is captured today beyond a free-text `note`.

Related, but *not* part of this pass: `docs/sims-hod-committee-roadmap.md` already covers wiring `SELECTED_FOR_SGA` to an actual committee. Keep that separate — don't conflate the two. Sequencing note: do this status-pipeline work first, since the committee roadmap's Milestone 2 reads `dto.statusChanged === 'SELECTED_FOR_SGA'`, which is untouched by this plan.

## Decisions to make before writing code (15 min, do this first)

1. **How to store the two approval sub-types.**
   Recommended: don't add two new `SuggestionStatus` enum values (that forces changes to `ALLOWED_TRANSITIONS`, `STATUS_CONFIG`, board columns, filters, leaderboard logic — everywhere `status` is switched on). Instead add one new field, `decisionType: WORKPLACE_CORRECTION | DAILY_KAIZEN | null`, set alongside `status: APPROVED_FOR_IMPLEMENTATION`. Cheaper, and the guide's own flow diagrams treat both as landing in the same next state (`Implemented`) anyway.

2. **How to store the per-decision structured fields.**
   Recommended: one `decisionDetails Json?` column on `Suggestion`, shape depending on `status`/`decisionType`. The codebase already uses `Json?` for exactly this kind of variable-shape metadata (`Notification.metadata`, `User.notificationPreferences`) — no new pattern introduced. Alternative (discrete typed columns per field) is more type-safe but means ~15 new nullable columns for fields that only apply to one branch each; not worth it here.

3. **Whether "Implemented" becomes a real `SuggestionStatus` value.**
   Recommended: yes — add `WAITING_FOR_REVIEW` and `IMPLEMENTED` to the `SuggestionStatus` enum. This is the faithful reading of the guide (Implemented is item 8 of 8 in the "Final Status List," same level as Rejected/On Hold) and it fixes the existing mislabeling in `STATUS_CONFIG` for free. `ImplementationStatus`'s WIP-tracking values (`WORK_IN_PROGRESS`, `SLOW_PROGRESS`, etc.) can stay as-is for granular progress *while* status is still `APPROVED_FOR_IMPLEMENTATION` — they just no longer double as the "done" signal; `status: IMPLEMENTED` is the done signal.

4. **Transition into `UNDER_REVIEW`.**
   Recommended: explicit action, not automatic-on-first-GET (auto-on-view is invisible in the audit trail and easy to trigger by accident, e.g. an admin browsing the queue). Add `WAITING_FOR_REVIEW → UNDER_REVIEW` as a normal reviewer-triggered transition through the existing `PATCH /sims/:id/review` endpoint — no new endpoint needed.

If you'd rather go with the cheaper alternatives on 1/3 (single field instead of enum split either way), the timeline below still applies — the migration step just gets smaller.

## Timeline for tomorrow

### Block 1 — Schema + migration (~45 min)
- Add `WAITING_FOR_REVIEW` and `IMPLEMENTED` to `SuggestionStatus`; add `DecisionType` enum (`WORKPLACE_CORRECTION`, `DAILY_KAIZEN`); add `Suggestion.decisionType DecisionType?` and `Suggestion.decisionDetails Json?`.
- Default new suggestions to `WAITING_FOR_REVIEW` instead of `UNDER_REVIEW`.
- Write the migration under `packages/db/prisma/migrations/` (there's already an unapplied one sitting at `packages/db/prisma/migrations/20260717_employee_email_nullable/` — apply/reconcile that first so you're not migrating on top of drifted state).
- No backfill needed for existing rows: they keep `status: APPROVED_FOR_IMPLEMENTATION`, `decisionType: null` until next touched — same "don't backfill, just don't show up until touched" approach the committee roadmap already uses.

### Block 2 — Backend: transitions + validation (~1.5 hr)
- `apps/api/src/sims/sims.service.ts:19-25` — rewrite `ALLOWED_TRANSITIONS` for the new 8-state graph:
  - `WAITING_FOR_REVIEW → [UNDER_REVIEW]`
  - `UNDER_REVIEW → [ON_HOLD, SELECTED_FOR_SGA, APPROVED_FOR_IMPLEMENTATION, REJECTED]`
  - `ON_HOLD → [UNDER_REVIEW, SELECTED_FOR_SGA, APPROVED_FOR_IMPLEMENTATION, REJECTED]` (the "Reviewed Again" loop — already this shape today, keep it)
  - `SELECTED_FOR_SGA → [IMPLEMENTED, REJECTED]` (plus whatever your committee-roadmap Milestone 2 needs later)
  - `APPROVED_FOR_IMPLEMENTATION → [IMPLEMENTED, REJECTED]`
  - `IMPLEMENTED → []`, `REJECTED → []`
- In `reviewSuggestion`: require `decisionType` when `statusChanged === 'APPROVED_FOR_IMPLEMENTATION'`; validate `decisionDetails` shape per `decisionType`/status server-side (a small switch is enough, no need for a schema-validation library given only 4 shapes).
- Enforce the guide's explicit "must record" rules as validation, not just UI hints: reject the transition if required fields for that branch are missing — e.g. `ON_HOLD` without `reviewDate` + reason, `REJECTED` without a `note`.
- `updateImplementationStatus` — decide whether this endpoint still makes sense once `IMPLEMENTED` is a real status. Likely keep it for the WIP-tracking sub-values while still `APPROVED_FOR_IMPLEMENTATION`, but add a check: once `status === 'IMPLEMENTED'`, no more implementation-status edits.

### Block 3 — Frontend: decision forms (~2 hr, the biggest chunk)
- `apps/web/app/sims/[id]/page.tsx:202-234` — the review mutation already exists; extend the review form so choosing "Approve" prompts for `decisionType` first, then renders the matching field set:
  - Workplace Correction: action required, responsible person, support required, target date.
  - Daily Kaizen: improvement owner, support team, target date, expected result, before/after evidence (reuse whatever image-upload pattern `imageUrl` already uses on `CreateSuggestionDto`).
  - SGA: problem statement, team leader + members, target, timeline, review dates.
  - On Hold: reason, responsible person, support required, review date, next action.
- `apps/web/app/sims/page.tsx:36-53` — update `STATUS_CONFIG`, `BOARD_COLUMNS`, `ALL_STATUSES` for the 8 statuses; fix the `APPROVED_FOR_IMPLEMENTATION` → "Implemented" mislabel while you're in there (it becomes "Approved" once `IMPLEMENTED` is its own status).
- Add an "Implemented" board column with the completion evidence read-only.
- Add a "Start Review" button for `WAITING_FOR_REVIEW` cards in the HOD queue.

### Block 4 — Notifications (~30 min)
- `submitSuggestion` already notifies HODs (`sims.service.ts:136-149`) — no change, they still get pinged immediately regardless of the new `WAITING_FOR_REVIEW` state.
- Add an employee-facing notification on `IMPLEMENTED` (the guide requires "the employee is informed" — currently `reviewSuggestion`'s generic notify-on-status-change covers this already via the existing block at `sims.service.ts:483-493`, just confirm the message reads sensibly for `IMPLEMENTED`).
- Optional stretch: reuse `SimsReminderService` to nag HODs when an `ON_HOLD` suggestion's `reviewDate` has passed — the guide explicitly says a suggestion shouldn't sit On Hold without a review date, so this is the natural enforcement point.

### Block 5 — Verify + polish (~45 min)
- Manually walk all 5 flows from the guide's "SIMS Status Flow" section end to end in the running app (Workplace Correction, Daily Kaizen, SGA, On Hold → resumed, Rejected).
- Confirm old suggestions (`decisionType: null`) still render without crashing the detail page.
- Update `getSummary`/`getLeaderboard`/`getDepartmentLeaderboard` (`sims.service.ts:294-409`) if any of them assume the old 5-value enum exhaustively (they currently just tally by whatever `status` string comes back, so likely fine — just re-check the points logic at `sims.service.ts:352` since `APPROVED_FOR_IMPLEMENTATION` no longer implies "done").

## Total estimate

~5.5 hours of focused work — realistic for one day if Block 3 doesn't balloon. If it does, ship Blocks 1–2 first (schema + backend rules) and let the review form stay text-note-only for a day before building the per-decision fields — the pipeline is still correct and enforced server-side even before the UI catches up.
