# DWMS branch move and validation — 8 September 2026

Work now belongs on `feature/dwms`. Merge commit `3dbc4ee` incorporates staging through `594d44e`; `main` remains at `d4cd100`. Two older feature migrations were removed during conflict resolution because staging contains identical migrations under newer timestamps.

## Ported changes

- Task titles and dates are validated. Manual assignment, approval, backup ownership and explicit overdue recipients are checked against organization membership and eligible employee directories.
- Explicit overdue recipients are persisted and can view their alerts. Staging's owner-only default and alert deduplication remain in place, including for recurring activities imported by another employee.
- Shared progress rules prevent backward transitions and edits to completed or approval-pending occurrences. Competing acknowledgement, progress, completion, approval and rejection requests check the previously read status and timestamp; lost updates return HTTP 409 before notification/history side effects.
- Task creation shows directory failures, trims titles and prevents repeated submission while the request or successful redirect is pending. Dropdowns fit their containers and the page-info popup fits a mobile viewport.

## Newer staging behavior retained

The organization timezone and office-calendar scheduler, advance occurrence generation, activity-based creation, per-occurrence completion documents, approval comments and history remain intact. Staging already provides the Approvals navigation and server-derived deadline views. The older main implementation and its tests were not copied over these newer workflows.

## Validation

The adapted backend suite contains 63 passing tests covering creation permissions, date validation, progress, overdue completion approval, competing writes, selected recipient visibility/delivery and repeated-overdue abnormalities. These use service mocks rather than a real database.

Production API and frontend TypeScript checks, plus lint for the four modified frontend components, pass.

The Prisma client was regenerated for the merged schema. The local API on port 5000 recognizes the requested account with a password and organization membership, including after restoring the two local STEEL flags that had been temporarily removed for main compatibility.

Earlier Chrome checks used synthetic API responses on the old branch. They do not establish authenticated end-to-end coverage of this merged version. Real browser-to-API journeys, historical occurrence audits, multi-process escalation races and notification failure recovery remain to be tested.

## UI simplification pass

The broader system testing plan is deferred at the user's request. The DWMS sidebar now uses grouped text links and direct task/alert creation links. The task form defaults to a simple task, removes the large guidance panel, uses quieter styling and redirects immediately after successful assignment. Creation mode follows the URL so switching between sidebar actions updates the displayed form.

Following design feedback, DWMS uses the shared application Header directly. The former module Header re-exports that component. Only DWMS page-title entries were added to the shared header; its appearance and behavior are unchanged. The simplified sidebar retains the application's indigo palette, rounded navigation items, 256px width and standard page background.

Frontend type checking passed. An isolated Chrome check with synthetic responses verified desktop and 390px mobile layouts, direct task/alert switching, absence of horizontal overflow, and mobile menu Escape/focus restoration with no runtime exceptions. This is UI verification, not authenticated database workflow coverage.

## Original workspace backup

The complete original workspace is preserved in the stash named `Backup main workspace before DWMS branch move 2026-09-08` and in `/tmp/dwms-branch-move-20260908/`. The unrelated SGA, employee-import/template and Docker Compose work remains in those recovery copies; it has not been applied to this DWMS working tree. This backup predates the DWMS release commit; the unrelated work remains outside that release.

Desktop sidebar collapse now retains a 48px icon navigation rail. Shortcuts share the expanded navigation role filters, carry accessible labels and tooltips, and highlight the current destination. Expanded navigation remains text-based.

## Page layout and information density

Task cards now use neutral borders, compact spacing, direct acknowledgement, and two columns on wide screens. Today summaries include completed occurrences in their totals while keeping them out of the actionable list; not-applicable occurrences are excluded from the completion denominator. Today also shows tasks awaiting approval. Empty or failed loads do not display invented zero totals.

The dashboard exposes eight compact metrics above the charts: scheduled tasks, completed, not completed, overdue, open alerts, completion rate, average acknowledgement time, and average completion time. Counts come from the selected dashboard response; not-completed is scheduled minus completed. Single-point trends remain visible without hovering.

Page-level width caps were removed from task and alert details, task creation, assigned-work content and the settings access message. Other DWMS page containers already used the available width. Dialog and dropdown limits remain to keep overlays usable. Alert, assignment and approval cards use neutral borders and reduced padding; status badges and validation indicators remain meaningful.

Frontend type checks and lint passed during this pass. Synthetic Chrome checks at 390px and 1920px verified completion totals, direct acknowledgement, eight dashboard statistics, fluid layout width and no horizontal overflow. A standard task card measured 95px high. These checks do not replace the deferred authenticated system tests.

## Staging release requirements

The release includes `20260908120000_dwms_overdue_recipients`, adding empty-by-default recipient arrays to Task and Alert. Apply this migration before deploying the API; the staging push workflow does not run Prisma migrations.

The Gemba Plastic workbook, local company import and local test-account roles are not part of this Git release.
