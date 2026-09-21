# Alerts and Abnormalities

Every alert has one history. Each time it is raised again, the raise count increases and a new occurrence appears in the timeline. At the third raise, the same history becomes an abnormality.

## Views

- **My Alerts** and **My Abnormalities** show histories for which you are the responsible person.
- **My Team's Alerts** and **My Team's Abnormalities** show histories for employees who report to you directly or indirectly.
- **Department Alerts** and **Organization Alerts** have no responsible person.
- **Opened by Me** shows histories you initially raised or raised again.

You can search and filter by severity. The cards show the raise count and how many occurrences still need acknowledgment.

## Acknowledgment

The responsible person must acknowledge every raise with a written note. Open an alert and enter the note beside each pending occurrence. The timeline then shows who acknowledged it, when, and what they wrote. Department and organization alerts do not require acknowledgment.

Comments remain available for discussion and are separate from acknowledgment notes. Alerts do not have open or closed states or an approval workflow.

## Overdue tasks

A task instance can generate one automatic overdue alert. Later scheduler runs do not create another for that instance. The task owner is responsible for acknowledging it. The original assigner may manually raise or re-raise an alert for that task owner.
