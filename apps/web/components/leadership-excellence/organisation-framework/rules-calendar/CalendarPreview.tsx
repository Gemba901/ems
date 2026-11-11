import type { Frequency } from "./calendar-model";
import {
  displayDate,
  displayMonth,
  calendarNoteGroups,
  FREQUENCY_LABELS,
} from "./calendar-editor";
import styles from "./rules-calendar.module.css";
import type { CalendarPreview as Preview } from "@/services/leadership-excellence/rules-calendar.service";

export function CalendarPreview({
  preview,
  reviewFrequency,
  month,
  onMonthChange,
}: {
  preview: Preview;
  reviewFrequency: Frequency;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const daily = preview.periods[0]?.frequency === "daily";
  const noteDate = (note: string) =>
    note.replace(/^(\d{4}-\d{2}-\d{2}):/, (_, date) => `${displayDate(date)}:`);
  const coveredMonths = new Set<string>();
  for (const period of preview.periods) {
    const date = new Date(`${period.start.slice(0, 7)}-01T00:00:00Z`);
    while (date.toISOString().slice(0, 7) <= period.end.slice(0, 7)) {
      coveredMonths.add(date.toISOString().slice(0, 7));
      date.setUTCMonth(date.getUTCMonth() + 1);
    }
  }
  const months = [...coveredMonths].sort();
  const selectedMonth = months.includes(month) ? month : "";
  const rows = selectedMonth
    ? preview.periods.filter(
        (p) =>
          p.start.slice(0, 7) <= selectedMonth &&
          p.end.slice(0, 7) >= selectedMonth,
      )
    : preview.periods;
  const reviews = selectedMonth
    ? preview.reviews.filter(
        (p) =>
          p.start.slice(0, 7) <= selectedMonth &&
          p.end.slice(0, 7) >= selectedMonth,
      )
    : preview.reviews;
  return (
    <div className="space-y-4">
      {!!preview.warnings?.length && (
        <div
          role="note"
          className="rounded-lg border border-border bg-accent p-3 text-sm"
        >
          <strong>Check review timing</strong>
          {preview.warnings.map((warning) => (
            <p key={warning} className="mt-1">
              {warning}
            </p>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{rows.filter((p) => p.scheduled).length}</strong> scheduled of{" "}
          {rows.length} periods{" "}
          {selectedMonth ? "overlapping this month" : "in the cycle"}
        </p>
        <label className={`${styles.formField} ${styles.monthFilter} text-sm`}>
          <span>Show month</span>
          <select
            className="rounded-md border border-input bg-background p-2"
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
          >
            <option value="">Full cycle</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {displayMonth(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead className="sticky top-0 bg-accent text-accent-foreground">
            <tr>
              {(daily
                ? [
                    "Date",
                    "Submit results by",
                    "Verify results by",
                    "Day status",
                  ]
                : [
                    "Period",
                    "Working days",
                    "Submit results by",
                    "Verify results by",
                    "Schedule",
                  ]
              ).map((x) => (
                <th key={x} className="p-3 font-medium">
                  {noteDate(x)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.key} className="border-t border-border align-top">
                <td className="p-3 whitespace-nowrap">
                  {displayDate(p.start)}
                  <br />
                  {p.end !== p.start ? `to ${displayDate(p.end)}` : ""}
                  {p.partial && (
                    <small className="block text-muted-foreground">
                      Partial cycle boundary
                    </small>
                  )}
                </td>
                {!daily && <td className="p-3">{p.workingDays}</td>}
                <td className="p-3 whitespace-nowrap">
                  {p.submitBy ? (
                    <>
                      {displayDate(p.submitBy.date)}
                      <br />
                      <span className="text-muted-foreground">
                        {p.submitBy.time} · {p.submitBy.timeZone}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3">
                  {p.verifyBy
                    ? displayDate(p.verifyBy)
                    : p.verificationPendingSubmission
                      ? "After actual submission · date pending"
                      : "—"}
                </td>
                <td className="max-w-[300px] p-3">
                  <strong
                    className={`${styles.statusBadge} ${p.scheduled ? styles.approved : styles.draft}`}
                  >
                    {p.scheduled
                      ? daily
                        ? "Working day"
                        : "Scheduled"
                      : "Not scheduled for work"}
                  </strong>
                  {p.reasons.length > 0 && (
                    <CalendarNotes notes={p.reasons} compact={daily} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Non-working dates are not zero results or overdue failures. A period
        containing working days remains scheduled. Cross-month periods retain
        their boundaries.
      </p>
      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Performance reviews · {FREQUENCY_LABELS[reviewFrequency]} (
          {reviews.length})
        </summary>
        <p className="my-2 text-muted-foreground">
          These dates follow the performance-review frequency and review
          allowance set in Periods & responsibilities. Changing the reporting
          preview frequency does not change this review schedule. Show month
          filters both lists; a period that crosses two months keeps its full
          dates.
        </p>
        {!reviews.length && <p>No review periods overlap this month.</p>}
        <ul className="grid gap-2 sm:grid-cols-2">
          {reviews.map((p) => (
            <li key={displayDate(p.start)}>
              {displayDate(p.start)} – {displayDate(p.end)}
              <br />
              <span className="text-muted-foreground">
                {p.completeBy
                  ? `Complete review by ${displayDate(p.completeBy)}`
                  : "Not scheduled"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function CalendarNotes({
  notes,
  compact,
}: {
  notes: string[];
  compact: boolean;
}) {
  const groups = calendarNoteGroups(notes);
  if (compact)
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        {groups
          .map((g) =>
            g.reason === "Outside normal working week"
              ? "Regular day off"
              : g.reason,
          )
          .join("; ")}
      </p>
    );
  const regular = groups.find(
    (g) => g.reason === "Outside normal working week",
  );
  const other = groups
    .filter((g) => g !== regular)
    .reduce((n, g) => n + g.dates.length, 0);
  return (
    <div className={`${styles.calendarNotes} mt-1 text-xs`}>
      <p>
        {[
          regular
            ? `${regular.dates.length} regular ${regular.dates.length === 1 ? "day" : "days"} off`
            : "",
          other
            ? `${other} other calendar ${other === 1 ? "entry" : "entries"}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer">View dates and reasons</summary>
        {groups.map((g) => (
          <p key={g.reason} className="mt-2">
            <strong>{g === regular ? "Regular days off" : g.reason}</strong>
            {g.dates.some(Boolean)
              ? `: ${g.dates.filter(Boolean).map(displayDate).join("; ")}`
              : ""}
          </p>
        ))}
      </details>
    </div>
  );
}
