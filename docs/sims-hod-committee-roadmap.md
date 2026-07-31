# SIMS: HOD-first, Committee-for-reporting — Implementation Milestone Journey

Requirement (Rodgers, 2026-07-16): *"Suggestions go to HOD first, and later to the committee for
reporting purposes."*

This is a roadmap, not a build — it's here so you can implement it yourself at your own pace.
Each milestone is independently shippable and leaves the module in a working state.

## Where things stand today

- **HOD-first already works.** `submitSuggestion` resolves the department's HOD(s) and notifies
  them (`apps/api/src/sims/sims.service.ts:118-149`); HODs review via `reviewSuggestion`
  (`sims.service.ts:379`), gated by `RolesGuard`/`@Roles(Role.HOD)` on `PATCH /sims/:id/review`.
- **`SELECTED_FOR_SGA` is a dead end.** It's a valid `SuggestionStatus` an HOD can set
  (`ALLOWED_TRANSITIONS`, `sims.service.ts:19-25`), but nothing ever reads it. No suggestion is
  ever linked to a `SteeringCommittee` record.
- **Committee is membership-only.** `apps/api/src/committee/committee.service.ts` only does CRUD
  on `SteeringCommittee` / `SteeringCommitteeMember` — create committee, add/remove member, list
  "my committees." There is no relation from `Suggestion` to `SteeringCommittee` in
  `packages/db/prisma/schema.prisma`, and no endpoint that hands a suggestion to a committee.
- So today, "later to the committee" is a naming aspiration with no wiring behind it. That's the
  gap this roadmap closes.

## Decisions to make before you start (Milestone 0)

These are cheap to decide now and expensive to reverse later — answer them first:

1. **Trigger**: does a suggestion go to committee automatically the moment an HOD sets
   `SELECTED_FOR_SGA`, or does someone (HOD/Admin) explicitly "forward to committee" as a
   separate action? (Recommended: automatic on `SELECTED_FOR_SGA` — one less step, and the status
   name already implies it.)
2. **Which committee?** Org has multiple `SteeringCommittee` rows (`CommitteeType` suggests more
   than one kind exists). Does every `SELECTED_FOR_SGA` suggestion go to *one* designated
   committee per organization, or does the HOD pick which committee when they select the status?
3. **"For reporting purposes" — read-only or does the committee act on it?** i.e. does the
   committee only *see* a report/log of what HODs selected (no further status changes from
   committee members), or can committee members also change `status`/`implementationStatus`
   themselves? This determines whether you need new permissions on `PATCH /sims/:id/review` at
   all, or just a read view.
4. Does forwarding to committee need its own audit trail entry (reuse `SuggestionReview`, which
   already logs every status change with a reviewer + note), or a lighter-weight log?

The rest of this doc assumes the recommended answers (automatic trigger, one committee per
org/type, read-only reporting) but flags where the alternative changes the work.

## Milestone 1 — Data model: link Suggestion → Committee

- Add to `packages/db/prisma/schema.prisma`:
  - `Suggestion.committeeId String?` + relation to `SteeringCommittee`, and `forwardedToCommitteeAt DateTime?`.
  - `SteeringCommittee.suggestions Suggestion[]` back-relation.
  - If Q2 above resolves to "HOD picks the committee," also expose the org's committee list to
    the review UI; if it's "one committee per org," store which committee is the designated
    receiver on `Organization` (or a settings table) instead of asking the HOD each time.
- Write the migration (`packages/db/prisma/migrations/`, following the existing naming pattern
  like `20260702_reconcile_suggestion_hod_review_and_employee_notifications`).
- No data backfill needed — existing `SELECTED_FOR_SGA` suggestions can stay `committeeId: null`
  and simply won't appear in committee reporting until touched again.

## Milestone 2 — Backend: forward-to-committee + reporting endpoint

- In `SimsService.reviewSuggestion` (`sims.service.ts:379`): when `dto.statusChanged ===
  'SELECTED_FOR_SGA'`, set `committeeId` (resolved per your Milestone 0 answer) and
  `forwardedToCommitteeAt: new Date()` in the same `$transaction` that already updates the
  suggestion and writes the `SuggestionReview` row.
- Add a new read endpoint, e.g. `GET /sims/committee-report` (mirror the shape of
  `getAllSuggestions`/`getDepartmentSuggestions`) that:
  - Filters `Suggestion` where `committeeId` is set (or `status: 'SELECTED_FOR_SGA'` plus later
    `APPROVED_FOR_IMPLEMENTATION`/`REJECTED` outcomes, if you want the committee to see the full
    lifecycle of what they were shown, not just the current queue).
  - Restrict to org members who are on *some* committee — reuse the `getMyCommittees` pattern from
    `CommitteeService` to check membership, or gate with a role if Q3 says committee membership
    doesn't map to a role.
  - Include department + HOD + review history (`suggestionInclude` already has the shape you
    need) so the report is self-contained.
- If Milestone 0 / Q3 resolved to "committee can act," extend the existing authorization check in
  `reviewSuggestion` (`isDepartmentHOD`/`isSuperAdmin`/`isAdminOrMgmt`) to also allow committee
  members for suggestions already linked to their committee.

## Milestone 3 — Notifications

- When a suggestion is forwarded (Milestone 2), notify committee members the same way
  `submitSuggestion` notifies HODs today (`notifications.createMany`, `module: 'SIMS'`,
  `actionUrl: '/sims/committees/:committeeId'` or similar).
- Reuse `SimsReminderService` (`apps/api/src/sims/sims.reminder.service.ts`) as a template if you
  want a periodic "N suggestions awaiting committee reporting" digest — it already has the
  group-by-department batching pattern you'd adapt to group-by-committee.

## Milestone 4 — Frontend: committee reporting view

- `apps/web/app/sims/committees/` already exists for committee membership — add a reporting tab
  or a new route (e.g. `apps/web/app/sims/committees/[id]/report/page.tsx`) that lists forwarded
  suggestions using the new `GET /sims/committee-report` endpoint.
- Reuse the existing `SuggestionCard`/list-view patterns from `apps/web/app/sims/page.tsx` rather
  than building new components — the data shape is the same `Suggestion` type.
- Add `SimsService.getCommitteeReport(...)` to `apps/web/services/sims.service.ts` alongside the
  other query methods.

## Milestone 5 — Polish

- CSV export for the committee report (the org-wide list view already has `exportToCSV` in
  `sims/page.tsx` — extend it or copy the pattern).
- Decide whether `forwardedToCommitteeAt` should show up anywhere HOD-facing (e.g. "forwarded 3
  days ago, awaiting committee sign-off") to close the loop for the person who selected it.
- Once this ships, update the `SELECTED_FOR_SGA` status label in `STATUS_CONFIG`
  (`sims/page.tsx:36-42`) if the committee step changes what that status should be called in the UI.

## Suggested order

M0 (decide) → M1 (schema/migration) → M2 (backend forward + report endpoint) → M4 (minimal
frontend to see it working) → M3 (notifications) → M5 (polish). Notifications are placed after
the frontend deliberately — you'll want to see the report rendering correctly before you start
emailing/pinging people about it.
