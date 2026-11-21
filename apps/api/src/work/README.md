# Team Workspace production readiness

Implemented first slice:
- Task priorities: Low, Medium (default), High, Urgent.
- Task edits require `expectedVersion` from the fetched task. A stale version returns HTTP 409 with `VERSION_CONFLICT`; refetch before retrying.
- Task creation and field changes are recorded with actor identity and before/after values in the same transaction as the write.
- Completing a sprint records unfinished tasks returning to the backlog and increments their versions.
- Project members can read paginated history at `GET /work/tasks/:taskId/activity`. Existing project access rules apply.

Deploy migration `20261021100000_work_task_accountability` before deploying the API and web changes together. Existing tasks receive Medium priority and version 1. History begins at rollout; previous changes cannot be reconstructed.

Verification:
- Unit tests: `pnpm --filter api exec jest --runInBand work/dto/task.dto.spec.ts work/tasks/tasks.service.spec.ts work/work-location.spec.ts work/work-schedule.spec.ts`
- PostgreSQL integration tests use an isolated `WORK_TEST_DATABASE_URL` and migrations; see the API README. The suite covers concurrent edits and history access restrictions.

Remaining milestones include workspace notifications, task review/blocked states, attachments, project concurrency/history, attendance exception requests, employee handover, search and exports. This slice does not establish production readiness for the entire module.

## Dashboard attendance and automatic clock-out

The main dashboard banner includes the same attendance control as the workspace when WORK is enabled. It captures location only after the employee presses Clock in and retains the missing-location reason flow. Status refreshes every 30 seconds while visible.

The API scheduler checks up to 100 open scheduled records every minute. It uses each record's saved `scheduledEndAt + 30 minutes`, so later organization schedule changes cannot move an existing session's cutoff. Delayed jobs catch up at the cutoff rather than inflating hours. Late clock-ins after that cutoff close at their start to avoid negative durations. Holidays/non-working days without a saved scheduled end require manual clock-out.

Clock-out, version increment, automatic-close timestamp, and the employee's in-app notification commit in one transaction. A concurrent manual clock-out or correction wins if it commits first. Only the winning automatic closer notifies, including across API replicas. Failures retry on the next scan. The notification appears in the existing notification bell and links to attendance history; it does not send email/SMS.

Deploy migration `20261021110000_attendance_auto_clock_out` before the API/web release. Keep an API process running with Nest's scheduler enabled for unattended clock-out; closing the browser does not stop it. Existing overdue open scheduled records are included in catch-up. Automatic records are marked in the clock card, attendance table, and details, and HR can correct them through the existing audited flow.
