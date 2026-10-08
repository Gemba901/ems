# Employee DWMS details

Employee DWMS details adds an operational DWMS panel to an employee's EMS profile. It brings together the employee's current work, alert responsibility, abnormalities, and activities applicable through organization, department, job-title, or employee scope.

> Use this page when supporting one employee. It answers “What work and issues currently involve this person?” without searching several DWMS pages separately.

## 1. Open the panel

Open **EMS**, choose an employee, and view the employee detail page. The DWMS section is available only to authorized Management, Admin, Super Admin, and HR users.

The selected employee must belong to the current organization.

![Open the DWMS tab from an employee profile to see summary counts and current operational work.](../../public/dwms-docs/employee-dwms-details/01-dwms-summary.png)

## 2. Read the summary

The summary counts current tasks, current alerts, abnormalities, raised alerts, applicable activities, and active activities. Counts describe the selected employee, not the viewer.

- **Current tasks:** Work the employee still needs to finish.
- **Current alerts:** Alert histories for which the employee is responsible.
- **Abnormalities:** Those histories after their third raise.
- **Raised alerts:** Histories initially raised by the employee.
- **Applicable activities:** Standard work matching the employee's job role.
- **Active activities:** Applicable standard work currently enabled for the employee.

## 3. Current Tasks

Current Tasks lists the employee's open DWMS task occurrences with status, priority, and due information. Select a task to open its full DWMS detail when a link is available.

Completed and terminal historical work is not the focus of this panel; use Reports or the task workspaces for broader history.

## 4. Current Alerts

Current Alerts shows non-abnormality histories for which the employee is responsible. Each history shows its raise count and acknowledgment state.


## 5. Abnormalities

Abnormalities shows the employee's alert histories that have been raised at least three times.

## 6. Raised Alerts

Raised Alerts shows histories initially raised by the employee. The entry identifies the responsible person, task, department, or organization target involved.


## 7. Applicable Activities

Applicable Activities combines currently scoped Activity master records with previously assigned activities, so inactive or archived assignment history remains visible. Each item shows activity name, code, scope, frequency, and assignment state.

- **Inactive:** The activity matches the job title but does not yet generate routine work for this employee.
- **Active:** The activity is enabled for the employee and can generate scheduled task occurrences.

![Applicable Activities lists the job-title activities, frequency, assignment state, and activation action.](../../public/dwms-docs/employee-dwms-details/04-applicable-activities.png)

If an expected activity is missing, confirm the activity scope and target against the employee's organization, department, job title, or employee code.

## 8. Activate or deactivate an activity

Authorized activity managers can select **Activate** or **Deactivate** beside an applicable activity.

Activating stores the employee-activity assignment and enables routine task generation according to the activity frequency and effective rules. Deactivating requires confirmation, disables recurrence, and deletes untouched pending instances scheduled after today in the organization's timezone. Today's work, started work, and historical instances remain available.

## 9. Effects across DWMS

- Active activity assignments feed My Routine Work and Tasks assigned to me.
- Current task and alert changes refresh the employee's operational picture.
- Completion and acknowledgement metrics appear in Reports.
- Alert responsibility contributes to the employee's open-alert count.

Access to this panel does not grant permission to alter task progress or approve work; those actions continue to use their normal DWMS ownership and approval rules.
