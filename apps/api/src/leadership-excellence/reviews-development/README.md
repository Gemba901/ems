# Area 06 · Reviews & Development: integration guide

Area 06 has three parts:

- 06.01 performance reviews
- 06.02 feedback and coaching
- 06.03 action effectiveness

It reads verified results, plans and actions through Area 05 (`MonitoringExecutionSource`). It never copies or changes Area 04 actions.

This guide is for **Area 07** and anyone else who reads Area 06 data.

## Two ways to read

### 1. In-process provider (recommended inside the API)

```ts
// your-area.module.ts
import { ReviewsDevelopmentModule } from '../reviews-development/reviews-development.module';

@Module({ imports: [ReviewsDevelopmentModule] })
export class YourAreaModule {}

// your.service.ts
import { ReviewsDevelopmentService } from '../reviews-development/reviews-development.service';

constructor(private readonly development: ReviewsDevelopmentService) {}

const reviews = await this.development.listApprovedReviews(user, {
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  departmentId,
  employeeId,
});
```

`ReviewsDevelopmentService` implements `ReviewsDevelopmentProvider`, which is defined in `common/contracts.ts`. The types it uses are defined there too:

- `ApprovedReviewSummary`
- `CoachingMetadata`
- `EffectivenessAssessment`
- `ReviewReadFilter`

Every method takes the caller's `AccessTokenPayload` and applies the permission rules below. Pass the real user; there is no system bypass.

| Method                                | Returns                     |
| ------------------------------------- | --------------------------- |
| `listApprovedReviews(user, filter?)`  | `ApprovedReviewSummary[]`   |
| `listCoachingMetadata(user, filter?)` | `CoachingMetadata[]`        |
| `listEffectiveness(user, filter?)`    | `EffectivenessAssessment[]` |

### 2. HTTP (read-only)

All three routes use the base path `/api/leadership-excellence/reviews-development`. They need the same guards as the rest of LEX: JWT, tenant, roles (any LEX role) and the LEADERSHIP_EXCELLENCE module.

| Method | Path                         | Returns                        |
| ------ | ---------------------------- | ------------------------------ |
| GET    | `/integration/reviews`       | approved reviews               |
| GET    | `/integration/coaching`      | coaching metadata (no content) |
| GET    | `/integration/effectiveness` | effectiveness assessments      |

The API has no Swagger (`@nestjs/swagger` is not installed). The samples below are the reference.

## Filters (query string, or `ReviewReadFilter`)

All filters are optional.

| Filter         | Format       | Reviews                                            | Coaching                | Effectiveness                |
| -------------- | ------------ | -------------------------------------------------- | ----------------------- | ---------------------------- |
| `periodStart`  | `YYYY-MM-DD` | review period overlaps (`periodEnd ≥ periodStart`) | `date ≥`                | `assessedAt ≥`               |
| `periodEnd`    | `YYYY-MM-DD` | review period overlaps (`periodStart ≤ periodEnd`) | `date ≤`                | `assessedAt ≤` (end of day)  |
| `departmentId` | id           | review department                                  | record department       | action department            |
| `employeeId`   | employee id  | subject **or** reviewer                            | subject **or** reviewer | action owner **or** assessor |

To read one planning period, pass its start and end dates.

## Permission rules

**Org-wide roles** are SUPER_ADMIN, ADMIN and MANAGEMENT.

**Participants** are the subject (the employee or department lead) and the reviewer.

**Who can see a review or coaching record at all (its metadata):**

- the participants
- the subject's direct manager
- the HOD of its department
- org-wide roles

Records outside that scope are left out of the response entirely.

**Review content:**

- Personal reviews: content goes to participants only. Everyone else in scope gets `restricted: true`, `content: null` and `acknowledgement.comment: null`.
- Department reviews: everyone in metadata scope can read the content.

**Coaching (06.02):**

- The integration read never returns `topic`, `notes`, `support` or `response`, whoever the caller is. Only the screen's own endpoint shows these, and only to the two participants.
- `hasResponse` only says whether the employee has replied.

**Effectiveness:**

- Visible to org-wide roles, the department HOD, the action owner, the owner's manager, the goal owner and the assessor.
- Assessing is stricter. The assessor is never the action owner, and the action must be `VERIFIED` in Area 04.

Only reviews that have **at least one approved version** are returned. Drafts are never returned.

## Stable ids and versions

- `id` fields are UUIDs and never change. `code` (`REV-0001`, `COACH-0001`) is for display only.
- `version` is the latest approved review version.
  - Approved versions are frozen.
  - A revision opens version N+1 as a draft. While it is open, `revisionInProgress` is `true` and the response still carries version N.
- `planVersion` is the Area 03 plan version that the review facts were read from.
- `acknowledgement.version` tells you which approved version was acknowledged. If it is lower than `version`, the latest version has not been acknowledged yet.
- For effectiveness, `version` counts the assessments recorded for that action. It is 1 for the first assessment and goes up each time the assessment is updated.
- `actionId` and `linkedActionIds` are Area 04 action ids.

## Sample responses

### `GET /integration/reviews?periodStart=2026-09-01&periodEnd=2026-09-30`

```json
[
  {
    "id": "6f1c0a52-2b7e-4f0e-9d0e-1a7b3c9d2e11",
    "code": "REV-0003",
    "type": "PERSONAL",
    "version": 1,
    "revisionInProgress": false,
    "planDocumentId": "c3d9…",
    "planVersion": 2,
    "departmentId": "dept-ops",
    "periodStart": "2026-09-01",
    "periodEnd": "2026-09-30",
    "subjectId": "emp-123",
    "reviewerId": "emp-045",
    "meetingDate": "2026-10-05",
    "nextReviewDate": "2026-11-05",
    "approvedById": "emp-045",
    "approvedAt": "2026-10-06T09:12:44.000Z",
    "acknowledgement": {
      "version": 1,
      "employeeId": "emp-123",
      "acknowledgedAt": "2026-10-07T08:01:10.000Z",
      "concern": false,
      "comment": "Thanks — agreed on the support plan."
    },
    "linkedActionIds": ["a8e2…"],
    "restricted": false,
    "content": {
      "achievements": "…",
      "challenges": "…",
      "learning": "…",
      "supportNeeded": "…",
      "recognition": "…",
      "findings": "…",
      "decisions": "…",
      "noInputReason": "",
      "dataLimitReason": "",
      "snapshot": {
        "planVersion": 2,
        "measures": ["…"],
        "actions": ["…"],
        "complete": true
      }
    }
  }
]
```

The same review, read by MANAGEMENT or by the subject's HOD, is metadata only:

```json
{
  "id": "6f1c…",
  "version": 1,
  "restricted": true,
  "content": null,
  "acknowledgement": {
    "version": 1,
    "employeeId": "emp-123",
    "acknowledgedAt": "…",
    "concern": false,
    "comment": null
  }
}
```

### `GET /integration/coaching?employeeId=emp-123`

```json
[
  {
    "id": "0b6e…",
    "code": "COACH-0007",
    "kind": "COACHING",
    "planDocumentId": "c3d9…",
    "departmentId": "dept-ops",
    "subjectId": "emp-123",
    "reviewerId": "emp-045",
    "date": "2026-10-14",
    "relatesTo": "kpi:9f2a…",
    "hasResponse": true,
    "linkedActionIds": [],
    "createdAt": "2026-10-14T10:00:00.000Z",
    "updatedAt": "2026-10-15T07:30:00.000Z"
  }
]
```

`relatesTo` is one of `role`, `goal:<id>` or `kpi:<id>`.

### `GET /integration/effectiveness?departmentId=dept-ops`

```json
[
  {
    "id": "e41d…",
    "actionId": "a8e2…",
    "actionDocumentId": "c3d9…",
    "actionTitle": "Introduce shift handover checklist",
    "ownerId": "emp-123",
    "departmentId": "dept-ops",
    "status": "PARTLY_EFFECTIVE",
    "note": "Handover errors down 40%, night shift still inconsistent.",
    "evidence": "October QA log",
    "assessedById": "emp-045",
    "assessedAt": "2026-10-20T12:00:00.000Z",
    "version": 2
  }
]
```

`status` is one of `EFFECTIVE`, `PARTLY_EFFECTIVE` or `NOT_EFFECTIVE`.

## Screen endpoints (Area 06's own UI)

These are listed for reference. Area 07 should not use them.

| Method    | Path                                           | What it does                            |
| --------- | ---------------------------------------------- | --------------------------------------- |
| GET       | `/context`                                     | plans the caller can review or coach on |
| GET, POST | `/reviews`                                     | list reviews / start a review           |
| GET       | `/reviews/:id`                                 | one review                              |
| PUT       | `/reviews/:id/reflection`                      | save the reflection                     |
| POST      | `/reviews/:id/submit`                          | submit the reflection                   |
| PUT       | `/reviews/:id/discussion`                      | save the discussion                     |
| POST      | `/reviews/:id/refresh`                         | refresh the facts                       |
| POST      | `/reviews/:id/return`                          | return for clarification                |
| POST      | `/reviews/:id/approve`                         | approve                                 |
| POST      | `/reviews/:id/revise`                          | open a revision                         |
| POST      | `/reviews/:id/acknowledge`                     | acknowledge                             |
| POST      | `/reviews/:id/actions`                         | link an action                          |
| DELETE    | `/reviews/:id/actions/:actionId`               | unlink an action                        |
| GET, POST | `/coaching`                                    | list / record coaching                  |
| PUT       | `/coaching/:id`                                | update coaching                         |
| POST      | `/coaching/:id/actions`                        | link an action                          |
| DELETE    | `/coaching/:id/actions/:actionId`              | unlink an action                        |
| GET       | `/improvement/actions`                         | actions with effectiveness              |
| PUT       | `/improvement/actions/:actionId/effectiveness` | record effectiveness                    |
