"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calendarsApi } from "@/services/leadership-excellence/rules-calendar.service";
import type { CalendarComparison } from "./calendar-audience.types";
import { displayDate, displayMonth } from "./calendar-editor";
import styles from "./rules-calendar.module.css";

export function CalendarComparisonPanel({
  token,
  month,
  onMonthChange,
  mode,
  onModeChange: setMode,
  day,
  onDayChange: setDay,
  countries,
  onOpen,
  onBack,
}: {
  token: string;
  month: string;
  onMonthChange: (value: string) => void;
  mode: "DAY" | "MONTH";
  onModeChange: (value: "DAY" | "MONTH") => void;
  day: string;
  onDayChange: (value: string) => void;
  countries: Record<string, string>;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  const [result, setResult] = useState<CalendarComparison | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  const valid =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    month >= "1900-01" &&
    month <= "2199-12";
  useEffect(() => {
    const id = ++sequence.current,
      controller = new AbortController();
    setResult(null);
    setError("");
    if (!valid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void calendarsApi
      .comparison(token, month, controller.signal)
      .then((v) => {
        if (!controller.signal.aborted && sequence.current === id) setResult(v);
      })
      .catch((e) => {
        if (!controller.signal.aborted && sequence.current === id)
          setError(
            e instanceof Error ? e.message : "Could not load the comparison.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted && sequence.current === id)
          setLoading(false);
      });
    return () => controller.abort();
  }, [month, token, retry, valid]);
  const today = new Date().toLocaleDateString("en-CA");
  const selectedDay = result?.days.some((d) => d.date === day)
    ? day
    : result?.days.some((d) => d.date === today)
      ? today
      : (result?.days[0]?.date ?? "");
  useEffect(() => {
    if (selectedDay && day !== selectedDay) setDay(selectedDay);
  }, [selectedDay, day, setDay]);
  const summary = result?.days.find((d) => d.date === selectedDay);
  return (
    <Card className={styles.settingsCard}>
      <CardHeader className={styles.sectionHeader}>
        <CardTitle>Company working-day comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={styles.comparisonToolbar}>
          <div className={styles.comparisonPeriod}>
            <label className={`${styles.formField} text-sm`}>
              <span>Month</span>
              <select
                aria-label="Comparison month"
                className="h-9 rounded-lg border border-input bg-background px-2"
                value={month.slice(5)}
                onChange={(e) =>
                  onMonthChange(`${month.slice(0, 4)}-${e.target.value}`)
                }
              >
                {Array.from({ length: 12 }, (_, i) =>
                  String(i + 1).padStart(2, "0"),
                ).map((m) => (
                  <option value={m} key={m}>
                    {displayMonth(`2000-${m}`).replace(" 2000", "")}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${styles.formField} text-sm`}>
              <span>Year</span>
              <Input
                aria-label="Comparison year"
                type="number"
                min={1900}
                max={2199}
                value={month.slice(0, 4)}
                onChange={(e) =>
                  onMonthChange(`${e.target.value}-${month.slice(-2)}`)
                }
              />
            </label>
          </div>
          {!!result?.rows.length && (
            <div className={styles.comparisonModes}>
              <Button
                variant={mode === "DAY" ? "default" : "outline"}
                aria-pressed={mode === "DAY"}
                onClick={() => setMode("DAY")}
              >
                Day detail
              </Button>
              <Button
                variant={mode === "MONTH" ? "default" : "outline"}
                aria-pressed={mode === "MONTH"}
                onClick={() => setMode("MONTH")}
              >
                Month grid
              </Button>
            </div>
          )}
        </div>
        {!valid && (
          <p role="alert" className="text-sm text-destructive">
            Enter a year from 1900 to 2199 and choose a month.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}{" "}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry comparison
            </Button>
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm">
            Comparing approved calendars…
          </p>
        )}
        {result && (
          <>
            {!!result.rows.length && (
              <div className={styles.comparisonSummary}>
                <label
                  className={`${styles.formField} ${styles.comparisonDay} text-sm`}
                >
                  <span>Compare date</span>
                  <select
                    className="h-9 rounded-lg border border-input bg-background px-2 font-normal"
                    value={selectedDay}
                    onChange={(e) => setDay(e.target.value)}
                  >
                    {result.days.map((d) => (
                      <option value={d.date} key={d.date}>
                        {displayDate(d.date)}
                      </option>
                    ))}
                  </select>
                </label>
                <dl
                  className={styles.comparisonCounts}
                  aria-label="Calendar coverage on the selected date"
                >
                  <div>
                    <dt>With a calendar</dt>
                    <dd>{summary?.assigned ?? 0} people assigned</dd>
                  </div>
                  <div>
                    <dt>Without a calendar</dt>
                    <dd>{summary?.unassigned ?? 0} unassigned</dd>
                  </div>
                  <div>
                    <dt>Overlapping assignments</dt>
                    <dd
                      className={summary?.conflicts ? "text-destructive" : ""}
                    >
                      {summary?.conflicts ?? 0} conflicting
                    </dd>
                  </div>
                </dl>
              </div>
            )}
            {!result.rows.length ? (
              <div className={styles.comparisonEmpty} role="status">
                <p className="font-medium">
                  No approved calendars cover {displayMonth(month)}.
                </p>
                <p className="text-sm text-muted-foreground">
                  Choose another month, or return to Calendars to review your
                  drafts. This comparison shows approved calendars.
                </p>
                <Button variant="outline" onClick={onBack}>
                  Back to calendars
                </Button>
              </div>
            ) : mode === "DAY" ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <caption className="sr-only">
                    Calendar comparison for {displayDate(selectedDay)}
                  </caption>
                  <thead className="bg-accent">
                    <tr>
                      {[
                        "Calendar / group",
                        "Country & time zone",
                        "Day status",
                        "Reason",
                        "People covered",
                      ].map((h) => (
                        <th key={h} className="p-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => {
                      const cell = row.cells.find(
                        (c) => c.date === selectedDay,
                      )!;
                      return (
                        <tr
                          key={row.calendarId}
                          className="border-t border-border align-top"
                        >
                          <td className="p-3">
                            <Button
                              variant="link"
                              className="h-auto whitespace-normal p-0 text-left"
                              onClick={() => onOpen(row.calendarId)}
                            >
                              {row.name}
                            </Button>
                            <span className="mt-1 block">
                              {row.audience} · v{row.version}
                            </span>
                            {row.missingMembers > 0 && (
                              <span className="mt-1 block text-destructive">
                                {row.missingMembers} unavailable selections need
                                review
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            {countries[row.country] ||
                              row.country ||
                              "Country not set"}
                            <span className="block text-xs text-muted-foreground">
                              {row.timeZone}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`${styles.statusBadge} ${cell.working === true ? styles.approved : styles.draft}`}
                            >
                              {cell.working === null
                                ? "Outside cycle"
                                : cell.working
                                  ? "Working"
                                  : "Not working"}
                            </span>
                          </td>
                          <td className="max-w-sm p-3">{cell.reason}</td>
                          <td className="p-3">
                            {row.kind === "UNASSIGNED"
                              ? "No automatic assignment"
                              : `${cell.effectivePeople} people`}
                            {cell.conflicts > 0 && (
                              <span className="block text-destructive">
                                {cell.conflicts} conflicting
                              </span>
                            )}
                            <span className="block text-xs text-muted-foreground">
                              {row.matchingActive} match the selection before
                              overrides
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <p className="text-xs">
                  ✓ Working · – Not working · · Outside cycle · ! Assignment
                  conflict. Select a day to see the working status and reason
                  for each calendar.
                </p>
                <div className={styles.comparisonGrid}>
                  <table>
                    <caption className="sr-only">
                      Working-day matrix for {displayMonth(month)}
                    </caption>
                    <thead>
                      <tr>
                        <th>Calendar / group</th>
                        {result.days.map((d) => (
                          <th key={d.date} aria-label={displayDate(d.date)}>
                            {Number(d.date.slice(-2))}
                            <span className="block text-[10px] font-normal">
                              {new Date(
                                `${d.date}T00:00:00Z`,
                              ).toLocaleDateString("en-GB", {
                                weekday: "short",
                                timeZone: "UTC",
                              })}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row) => (
                        <tr key={row.calendarId}>
                          <th scope="row">
                            <button
                              type="button"
                              className="text-left text-primary underline underline-offset-2"
                              onClick={() => onOpen(row.calendarId)}
                            >
                              {row.name}
                            </button>
                            <span className="block text-xs font-normal">
                              {row.audience} · v{row.version}
                            </span>
                          </th>
                          {row.cells.map((cell) => (
                            <td key={cell.date}>
                              <button
                                type="button"
                                className={`${styles.dayCell} ${cell.working ? styles.dayWorking : styles.dayOff} ${cell.date === selectedDay ? styles.daySelected : ""}`}
                                onClick={() => {
                                  setDay(cell.date);
                                  setMode("DAY");
                                }}
                                title={`${displayDate(cell.date)}: ${cell.reason}. ${cell.effectivePeople} people; ${cell.conflicts} conflicts.`}
                                aria-label={`${row.name}, ${displayDate(cell.date)}, ${cell.working === null ? "outside cycle" : cell.working ? "working" : "not working"}, ${cell.effectivePeople} people${cell.conflicts ? `, ${cell.conflicts} conflicting` : ""}`}
                                aria-pressed={cell.date === selectedDay}
                              >
                                {cell.conflicts
                                  ? "!"
                                  : cell.working === null
                                    ? "·"
                                    : cell.working
                                      ? "✓"
                                      : "–"}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!!result.rows.length && (
              <details
                className={`${styles.calendarNotes} rounded-lg border border-border p-3 text-sm`}
              >
                <summary className="cursor-pointer font-medium">
                  About this comparison
                </summary>
                <div className="mt-3 space-y-2">
                  <p>
                    Approved versions only. Dates are local to each calendar’s
                    time zone. For example, comparing 1 January means 1 January
                    in each country, not one simultaneous moment. Counts use
                    current active people, including probation.
                  </p>
                  <p>
                    Each active person is counted once as assigned, unassigned
                    or conflicting on the chosen date. A calendar for selected
                    people takes priority over their department calendar, which
                    takes priority over Whole company. A non-working day still
                    has a calendar assignment.
                  </p>
                  <p>
                    “Match the selection” counts all active people in the
                    selected departments or people list. “People covered”
                    excludes people whose more specific calendar applies. If two
                    calendars have equal priority for someone, the comparison
                    flags the conflict instead of choosing one.
                  </p>
                  <p>
                    Older calendars may have no employees assigned. To use one
                    for everyone, create a revision, choose Whole company and
                    approve it. Existing plans keep their selected calendar
                    version.
                  </p>
                  <p>
                    Only approved calendars appear here. People are counted
                    using their current departments and the approved people
                    lists, even when you view a past month. For example, someone
                    who moved from Production to Maintenance is counted in
                    Maintenance.
                  </p>
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
