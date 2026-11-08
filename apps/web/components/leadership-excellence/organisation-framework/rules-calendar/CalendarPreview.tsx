import { displayDate } from "./calendar-editor";
import styles from "./rules-calendar.module.css";
import type { CalendarPreview as Preview } from "@/services/leadership-excellence/rules-calendar.service";

export function CalendarPreview({
  preview,
  month,
  onMonthChange,
}: {
  preview: Preview;
  month: string;
  onMonthChange: (month: string) => void;
}) {
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{preview.periods.filter((p) => p.scheduled).length}</strong>{" "}
          scheduled of {preview.periods.length} periods
        </p>
        <label className="text-sm">
          Show month{" "}
          <select
            className="ml-2 rounded-md border border-input bg-background p-2"
            value={selectedMonth}
            onChange={(e) => onMonthChange(e.target.value)}
          >
            <option value="">Full cycle</option>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="max-h-[460px] overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[660px] text-left text-sm">
          <thead className="sticky top-0 bg-accent text-accent-foreground">
            <tr>
              {[
                "Period",
                "Working days",
                "Submit by",
                "Verify by",
                "Schedule",
              ].map((x) => (
                <th key={x} className="p-3 font-medium">
                  {x}
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
                <td className="p-3">{p.workingDays}</td>
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
                  {p.verifyBy ? displayDate(p.verifyBy) : "—"}
                </td>
                <td className="max-w-[300px] p-3">
                  <strong
                    className={`${styles.statusBadge} ${p.scheduled ? styles.approved : styles.draft}`}
                  >
                    {p.scheduled ? "Scheduled" : "Not scheduled"}
                  </strong>
                  {p.reasons.length > 0 &&
                    (p.scheduled ? (
                      <details className="mt-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Calendar notes ({p.reasons.length})
                        </summary>
                        {p.reasons.map((x) => (
                          <p key={x} className="mt-1">
                            {x}
                          </p>
                        ))}
                      </details>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.reasons.join("; ")}
                      </p>
                    ))}
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
          Performance reviews ({preview.reviews.length})
        </summary>
        <p className="my-2 text-muted-foreground">
          These are review windows and completion dates, not meeting bookings. A
          review may be written or include a meeting.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {preview.reviews.map((p) => (
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
