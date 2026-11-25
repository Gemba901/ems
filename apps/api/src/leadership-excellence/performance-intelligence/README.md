# Area 07 — Performance Intelligence

Area 07 reuses the Area 03 KRA/KPI catalogue and approved commitments, and the
authorised Area 04 result, action and support projections. It does not create
another goal register or copy report facts into a separate reporting table.

## Pages

- `/leadership-excellence/performance-intelligence/libraries`: search definitions,
  create/adapt drafts, submit to one approver, approve/return, and open dated
  revisions. Versions and history are collapsed by default.
- `/leadership-excellence/performance-intelligence/dashboards`: targets, verified
  actuals, signed gaps, trends and completeness; independently measured company
  results, actions and support are kept separate.
- `/leadership-excellence/performance-intelligence/reports`: the same calculation
  and visibility rules, with filtered CSV export and a print view without the
  application navigation.

## API

All paths below use the prefix `/leadership-excellence/performance-intelligence`.
Browser requests add the same-origin `/api` proxy prefix. Authentication, trusted
tenant, membership, role and Leadership Excellence module guards apply.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/library` | Role-filtered shared definitions, approval versions and permitted operations |
| POST | `/library/commands` | Save a draft, submit, approve, return or revise a definition |
| GET | `/dashboard` | Authorised performance projection and available filter choices |
| GET | `/reports` | Same authorised projection for reporting |
| GET | `/reports/export.csv` | Filtered source-linked CSV using the same report projection |

Report filters: `cycle`, `startDate`, `endDate`, `departmentId`, `personId`,
`pillar`, `alignment`, `scope` (`MY`, `DEPARTMENT`, `ORGANIZATION`) and `search`.
Unsupported scopes are rejected. Choosing a filter cannot expand source access.
The selected planning cycle carries across the shared Leadership Excellence shell.
Date filters include complete measurement periods inside the selected range;
actions and support use their due dates.

## Shared library lifecycle

The existing `LexPlanningWorkspace.state` remains the single storage owner.
`definitionLibrary` is optional versioned JSON metadata beside `kras` and
`definitions`, so this change does not require a database migration. Existing
custom definitions are treated as drafts, never retrospectively approved.
Reference examples remain labelled guidance.

Commands have `{ expectedRevision, action, definitionId?, payload }`:

- `SAVE_DRAFT`: definition fields, existing `kraId` or a new `kraName`, optional
  `adaptedFromId`, `adaptedKraFromId` and `approverId`. Incomplete drafts are allowed.
- `SUBMIT`: designated `approverId` and optional `effectiveDate`. Validates KRA,
  name, meaning, calculation, source figures, unit, direction, aggregation and
  suitable data source.
- `APPROVE`: only the designated current authorised approver can publish. An
  explicit `effectiveDate` can be chosen when review finishes after the original
  intended date; the date is never silently shifted.
- `RETURN`: a reason for the changes required.
- `REVISE`: reason and effective date; preserves previous approved versions.

Management/admin accounts approve. Management, admin, HR and HOD accounts can
draft/adapt. Employees see reference examples and effective approved versions,
not working drafts or future publications. Each command records actor, time and
action, and uses the same workspace row lock and concurrency revision as Area 03.
Planning backup restore cannot discard library governance history.

`PerformanceIntelligenceLibraryModule` depends on persistence/authentication only.
Area 03 consumes its effective-approved provider; the main Area 07 reporting
module consumes Area 03 and Area 04. This direction avoids a circular Nest module
or reference-loading dependency. Draft revision content stays separate from the
active catalogue; existing approved plans retain their immutable definitions.

## Calculation and source rules

- Official actuals come from verified source observations. An unverified
  correction retains the previous official value and is labelled separately.
- Missing is not zero; not scheduled, not due, submitted and partial coverage
  are distinct. Null targets/actuals remain null in the API and export.
- A rate uses combined source figures: `6000/100` and `4500/150` produce
  `10500/250 = 42`, not an average of the two daily rates.
- Sum measures sum comparable verified periods. Closing/milestone measures use
  the latest chronological verified value. Different definitions/versions are
  never combined. Varying rate targets are compared per period unless a common
  comparable target exists; no denominator weights are invented.
- The signed gap is actual minus target; favourable direction comes from the
  approved definition. There is no invented overall score from unlike KPIs.
- Company/department measured results use their own Area 03 verified records;
  employee results and completed actions cannot replace them. Their summary is
  explicitly the latest verified reporting period, not an inferred year total.
- CSV exports the same authorised projection, including filters, generated time,
  coverage, period/source IDs and versions. Spreadsheet formula-like text is
  escaped. Private SWOT and review notes are not exported.

Area 05/06 standalone verification/review integrations remain owned by those
areas. This implementation reads available verified records; it does not invent
missing verification decisions, reviews or independent company actuals.
