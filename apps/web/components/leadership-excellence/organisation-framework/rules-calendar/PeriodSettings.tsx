"use client";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "./DateInput";
import { CalendarField, FieldFrame } from "./CalendarField";
import { intervalExample } from "./frequency-summary";
import { dateEntry } from "./calendar-editor";
import {
  DIRECTIONS,
  FREQUENCIES,
  customInterval,
  enabledFrequencies,
  periodFrequencies,
  type CalendarRules,
  type Frequency,
} from "./calendar-model";
import {
  DAYS,
  FREQUENCY_LABELS,
  RESPONSIBILITY_HELP,
  responsibilityChoices,
} from "./calendar-editor";
import styles from "./rules-calendar.module.css";

type Change = <K extends keyof CalendarRules>(
  key: K,
  value: CalendarRules[K],
) => void;
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className={styles.settingsCard}>
      <CardHeader className={styles.sectionHeader}>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
function Help({
  title = "Learn by example",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={`${styles.calendarNotes} rounded-lg border border-border p-3 text-sm`}
    >
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-3 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}
const Field = CalendarField;
function MonthInput({
  label,
  value,
  disabled,
  onChange,
  field,
}: {
  field: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [year, month = "01"] = value.split("-");
  return (
    <FieldFrame field={field}>
      <fieldset
        className={styles.monthField}
        disabled={disabled}
        aria-label={label}
      >
        <p className={styles.fieldLabel}>{label}</p>
        <div className={styles.monthFields}>
          <label className={styles.formField}>
            <span className="sr-only">{label} · month</span>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2"
              value={month}
              onChange={(e) => onChange(`${year}-${e.target.value}-01`)}
            >
              {Array.from({ length: 12 }, (_, i) =>
                String(i + 1).padStart(2, "0"),
              ).map((m) => (
                <option key={m} value={m}>
                  {new Intl.DateTimeFormat("en-GB", {
                    month: "long",
                    timeZone: "UTC",
                  }).format(new Date(`2000-${m}-01T00:00:00Z`))}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.formField}>
            <span className="sr-only">{label} · year</span>
            <Input
              type="number"
              min={1900}
              max={2199}
              value={year}
              onChange={(e) => onChange(`${e.target.value}-${month}-01`)}
            />
          </label>
        </div>
      </fieldset>
    </FieldFrame>
  );
}
const dayTypes = [
  ["CALENDAR", "Calendar days"],
  ["WORKING", "Working days"],
];
const rolls = [
  ["NONE", "Keep the calculated date"],
  ["NEXT_WORKING", "Next working date"],
];
const directionLabels = {
  higher: "Higher is better",
  lower: "Lower is better",
  range: "Within range",
  milestone: "Milestone",
  "zero-target": "Zero-target measure",
};
export function PeriodSettings({
  rules: r,
  disabled,
  change,
}: {
  rules: CalendarRules;
  disabled: boolean;
  change: Change;
}) {
  const enabled = enabledFrequencies(r);
  const c = customInterval(r);
  const used = periodFrequencies(r);
  function select(
    label: string,
    key: keyof CalendarRules,
    value: string,
    options: string[][],
  ) {
    return (
      <Field label={label} field={key}>
        <select
          className="h-9 w-full rounded-lg border border-input bg-background px-2"
          disabled={disabled}
          value={value}
          onChange={(e) => change(key, e.target.value as never)}
        >
          {options.map(([v, title]) => (
            <option key={v} value={v}>
              {title}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  function number(
    label: string,
    key: "submissionDays" | "verificationDays" | "reviewDays" | "splitDay",
    max = 60,
  ) {
    return (
      <Field label={label} field={key}>
        <Input
          className={styles.dayCount}
          type="number"
          min={key === "splitDay" ? 1 : 0}
          max={max}
          step={1}
          disabled={disabled}
          value={r[key]}
          onChange={(e) =>
            change(key, e.target.value === "" ? 0 : Number(e.target.value))
          }
        />
      </Field>
    );
  }
  function frequencyOption(f: Frequency) {
    const selected = enabled.includes(f);
    return (
      <label
        key={f}
        className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm"
      >
        <input
          type="checkbox"
          disabled={disabled || (selected && enabled.length === 1)}
          checked={selected}
          onChange={(e) =>
            change(
              "enabledFrequencies",
              e.target.checked
                ? [...enabled, f]
                : enabled.filter((x) => x !== f),
            )
          }
        />
        <span>
          {FREQUENCY_LABELS[f]}
          {r.reviewFrequency === f && (
            <small className="block text-muted-foreground">
              Also used for performance reviews
            </small>
          )}
        </span>
      </label>
    );
  }
  return (
    <>
      <Group title="Available reporting frequencies">
        <FieldFrame field="enabledFrequencies">
          <p className="text-sm text-muted-foreground">
            Choose the reporting options that will be available during planning.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enabled.map(frequencyOption)}
          </div>
          {enabled.length < FREQUENCIES.length && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Add another frequency
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FREQUENCIES.filter((f) => !enabled.includes(f)).map(
                  frequencyOption,
                )}
              </div>
            </details>
          )}
        </FieldFrame>
        {used.some((f) =>
          [
            "weekly",
            "fortnightly",
            "twice-monthly",
            "every-two-months",
            "custom",
          ].includes(f),
        ) && (
          <div
            id="calendar-frequency-settings"
            className="scroll-mt-24 space-y-3"
          >
            <h3 className="text-sm font-semibold">Frequency settings</h3>
            <div className={styles.frequencyGrid}>
              {used.includes("weekly") && (
                <fieldset
                  id="weekly-period-settings"
                  aria-labelledby="weekly-settings-title"
                  tabIndex={-1}
                  disabled={disabled}
                  className={styles.frequencyPanel}
                >
                  <h3
                    id="weekly-settings-title"
                    className={styles.frequencyTitle}
                  >
                    Weekly
                  </h3>
                  <Field label="Weekly period starts on" field="weekStart">
                    <select
                      disabled={disabled}
                      value={r.weekStart}
                      className="h-9 w-full max-w-xs rounded-lg border border-input bg-background px-2"
                      onChange={(e) =>
                        change("weekStart", Number(e.target.value))
                      }
                    >
                      {DAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Each weekly report or review covers work from{" "}
                    {DAYS[r.weekStart]} to {DAYS[(r.weekStart + 6) % 7]}.
                  </p>
                  {!enabled.includes("weekly") && (
                    <p className="mt-2 text-xs">
                      Used for performance reviews only.
                    </p>
                  )}
                </fieldset>
              )}
              {used.includes("fortnightly") && (
                <fieldset
                  disabled={disabled}
                  className={styles.frequencyPanel}
                  aria-labelledby="fortnightly-settings-title"
                >
                  <h3
                    id="fortnightly-settings-title"
                    className={styles.frequencyTitle}
                  >
                    Every two weeks
                  </h3>
                  <Field
                    label="First period starts (14-day anchor)"
                    field="fortnightAnchor"
                  >
                    <DateInput
                      aria-label="14-day anchor"
                      value={r.fortnightAnchor}
                      disabled={disabled}
                      onChange={(v) => change("fortnightAnchor", v)}
                    />
                  </Field>
                  {!enabled.includes("fortnightly") && (
                    <p className="mt-2 text-xs">
                      Used for performance reviews only.
                    </p>
                  )}
                </fieldset>
              )}
              {used.includes("twice-monthly") && (
                <fieldset
                  disabled={disabled}
                  className={styles.frequencyPanel}
                  aria-labelledby="twice-monthly-settings-title"
                >
                  <h3
                    id="twice-monthly-settings-title"
                    className={styles.frequencyTitle}
                  >
                    Twice monthly
                  </h3>
                  <Field
                    label="First period ends on this date each month (monthly split)"
                    field="splitDay"
                  >
                    <select
                      className="h-9 w-full max-w-xs rounded-lg border border-input bg-background px-2"
                      value={r.splitDay}
                      onChange={(e) =>
                        change("splitDay", Number(e.target.value))
                      }
                    >
                      {Array.from({ length: 27 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                          {n % 10 === 1 && n !== 11
                            ? "st"
                            : n % 10 === 2 && n !== 12
                              ? "nd"
                              : n % 10 === 3 && n !== 13
                                ? "rd"
                                : "th"}{" "}
                          of each month
                        </option>
                      ))}
                    </select>
                  </Field>
                  <IntervalSummary rules={r} frequency="twice-monthly" />
                  {!enabled.includes("twice-monthly") && (
                    <p className="mt-2 text-xs">
                      Used for performance reviews only.
                    </p>
                  )}
                </fieldset>
              )}
              {used.includes("every-two-months") && (
                <fieldset
                  disabled={disabled}
                  className={styles.frequencyPanel}
                  aria-labelledby="two-monthly-settings-title"
                >
                  <h3
                    id="two-monthly-settings-title"
                    className={styles.frequencyTitle}
                  >
                    Every two months
                  </h3>
                  <MonthInput
                    label="First month"
                    field="twoMonthAnchor"
                    value={r.twoMonthAnchor ?? `${r.start.slice(0, 7)}-01`}
                    disabled={disabled}
                    onChange={(v) => change("twoMonthAnchor", v)}
                  />
                  {!enabled.includes("every-two-months") && (
                    <p className="mt-2 text-xs">
                      Used for performance reviews only.
                    </p>
                  )}
                </fieldset>
              )}
              {used.includes("custom") && (
                <fieldset
                  disabled={disabled}
                  className={styles.frequencyPanel}
                  aria-labelledby="custom-settings-title"
                >
                  <h3
                    id="custom-settings-title"
                    className={styles.frequencyTitle}
                  >
                    Custom interval
                  </h3>
                  <div className={styles.customFields}>
                    <Field label="Every" field="customEvery">
                      <Input
                        aria-label="Custom interval count"
                        type="number"
                        min={1}
                        max={365}
                        step={1}
                        className={styles.intervalCount}
                        value={c.every}
                        onChange={(e) =>
                          change("customInterval", {
                            ...c,
                            every: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                    <Field label="Unit" field="customUnit">
                      <select
                        aria-label="Custom interval unit"
                        value={c.unit}
                        className="h-9 w-full rounded-lg border border-input bg-background px-2"
                        onChange={(e) => {
                          const unit = e.target.value as typeof c.unit;
                          change("customInterval", {
                            ...c,
                            unit,
                            anchor:
                              unit === "MONTHS"
                                ? `${c.anchor.slice(0, 7)}-01`
                                : c.anchor,
                          });
                        }}
                      >
                        <option value="DAYS">Calendar days</option>
                        <option value="WEEKS">Weeks</option>
                        <option value="MONTHS">Months</option>
                      </select>
                    </Field>
                    {c.unit === "MONTHS" ? (
                      <MonthInput
                        label="Starting month"
                        field="customAnchor"
                        value={c.anchor}
                        disabled={disabled}
                        onChange={(v) =>
                          change("customInterval", { ...c, anchor: v })
                        }
                      />
                    ) : (
                      <Field label="Starting date" field="customAnchor">
                        <DateInput
                          aria-label="Custom starting date"
                          value={c.anchor}
                          disabled={disabled}
                          onChange={(v) =>
                            change("customInterval", { ...c, anchor: v })
                          }
                        />
                      </Field>
                    )}
                  </div>
                  <IntervalSummary rules={r} frequency="custom" />
                  {!enabled.includes("custom") && (
                    <p className="mt-2 text-xs">
                      Used for performance reviews only.
                    </p>
                  )}
                </fieldset>
              )}
            </div>
          </div>
        )}
        <Help>
          <p>
            Enable the frequencies your company uses. During planning, each KPI
            chooses one of these; for example, daily output and monthly waste
            can belong to the same plan.
          </p>
          <p>
            Weekly defines the days whose work is reported or reviewed, not the
            submission date. A Monday start covers Monday–Sunday, even if work
            only happens Monday–Friday. With two calendar days allowed for
            submission after Sunday, submit by Tuesday; with three calendar days
            allowed for a weekly review, complete it by Wednesday.
          </p>
          <p>
            Every two weeks means 14 calendar days. Anchored on 1 January, the
            periods are 1–14 Jan, 15–28 Jan and 29 Jan–11 Feb. Weekends do not
            stretch the period.
          </p>
          <p>
            Twice monthly with a split on day 15 means 1–15 Jan, 16–31 Jan, then
            1–15 Feb. Every two months (every other month) means Jan–Feb,
            Mar–Apr, and so on from your starting month.
          </p>
          <p>
            Custom example: every 3 months, starting January 2027, covers
            January–March, April–June, July–September and October–December.
            Every 5 weeks, starting 1 January, covers 1 January–4 February, then
            5 February–11 March. The first and last periods are limited to your
            cycle dates.
          </p>
          <p>
            Working days determine whether work is scheduled and how working-day
            allowances are counted. They do not move period boundaries. Entirely
            non-working periods have no submission deadline.
          </p>
          <p>
            Months use calendar boundaries; quarters, half-years and years start
            in the cycle’s first month. Partial first and last periods are
            labelled in the preview. Reporting and review frequencies are
            selected separately. If both use the same frequency, they share its
            week start, anchor or monthly split.
          </p>
        </Help>
      </Group>
      <Group title="Submit results">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {number("Submission allowance after period end", "submissionDays")}
          {select(
            "Count submission allowance in",
            "submissionDayType",
            r.submissionDayType,
            dayTypes,
          )}
          {select(
            "If submission is due on a non-working day",
            "submissionRoll",
            r.submissionRoll,
            rolls,
          )}
          <Field label="Submit results by · local time" field="submissionTime">
            <Input
              type="time"
              disabled={disabled}
              value={r.submissionTime}
              onChange={(e) => change("submissionTime", e.target.value)}
            />
          </Field>
        </div>
        <Help>
          <p>
            Amina records January’s results and submits them for checking. With
            a 2-calendar-day allowance, January ends on 31 Jan and submission is
            due on 2 Feb at the chosen time in {r.timeZone}.
          </p>
          <p>
            The allowance sets the deadline; it is not extra time after becoming
            late. These common deadline rules apply to all enabled reporting
            frequencies. Preview each frequency to check suitability.
          </p>
        </Help>
      </Group>
      <Group title="Verify submitted results">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {select(
            "Start verification allowance from",
            "verificationBasis",
            r.verificationBasis ?? "SUBMISSION_DEADLINE",
            [
              ["SUBMISSION_DEADLINE", "Submission deadline · fixed schedule"],
              ["ACTUAL_SUBMISSION", "Actual submission · when received"],
            ],
          )}
          {number("Verification allowance", "verificationDays")}
          {select(
            "Count verification allowance in",
            "verificationDayType",
            r.verificationDayType ?? "CALENDAR",
            dayTypes,
          )}
          {select(
            "If verification is due on a non-working day",
            "verificationRoll",
            r.verificationRoll ?? "NONE",
            rolls,
          )}
        </div>
        <Help>
          <p>
            Verification checks the submitted figures and evidence. With a 2-day
            allowance from a submission deadline of 2 Feb, checking finishes by
            4 Feb, even if Amina submits on 1 Feb.
          </p>
          <p>
            With “Actual submission”, submitting on 1 Feb starts the clock then:
            2 calendar days makes verification due on 3 Feb. The original
            submission deadline remains unchanged, even if the results are
            submitted late.
          </p>
          <p>
            With “Actual submission”, the time allowed for checking starts when
            someone submits the results. Until that happens, the preview cannot
            show the verification due date.
          </p>
        </Help>
      </Group>
      <Group title="Performance reviews">
        <p className="text-sm text-muted-foreground">
          Choose how often performance is reviewed. This can differ from how
          often results are reported.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {select(
            "Performance-review frequency",
            "reviewFrequency",
            r.reviewFrequency,
            FREQUENCIES.map((f) => [f, FREQUENCY_LABELS[f]]),
          )}
          {number("Review allowance after review period end", "reviewDays")}
          {select(
            "Count review allowance in",
            "reviewDayType",
            r.reviewDayType ?? "CALENDAR",
            dayTypes,
          )}
          {select(
            "If review is due on a non-working day",
            "reviewRoll",
            r.reviewRoll ?? "NONE",
            rolls,
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Review periods use the frequency settings above. Changing the
          reporting preview does not change this review schedule.
        </p>
        {r.reviewFrequency === "weekly" && (
          <p className="text-sm">
            Review week: {DAYS[r.weekStart]}–{DAYS[(r.weekStart + 6) % 7]}.{" "}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => {
                const field = document.getElementById("weekly-period-settings");
                field?.scrollIntoView({ block: "center", behavior: "smooth" });
                field?.focus({ preventScroll: true });
              }}
            >
              Change week start
            </button>
          </p>
        )}
        <Help>
          <p>
            A monthly performance review considers January’s outcomes and
            follow-up actions. A 7-calendar-day review allowance makes it due on
            7 Feb, counted from 31 Jan. It does not restart after verification
            finishes.
          </p>
          <p>
            Choose enough time to use verified results. A review can include
            written decisions and a discussion about results and follow-up
            actions.
          </p>
        </Help>
      </Group>
      <Group title="Default responsibility rules">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["owner", "Plan owner"],
              ["provider", "Data provider"],
              ["verifier", "Result verifier"],
              ["approver", "Plan approver"],
            ] as const
          ).map(([key, label]) => (
            <Field label={label} key={key} field={key}>
              <select
                value={r.responsibilities[key]}
                disabled={disabled}
                className="h-9 w-full rounded-lg border border-input bg-background px-2"
                onChange={(e) =>
                  change("responsibilities", {
                    ...r.responsibilities,
                    [key]: e.target.value,
                  })
                }
              >
                {responsibilityChoices(key, r.responsibilities[key]).map(
                  ([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ),
                )}
              </select>
            </Field>
          ))}
        </div>
        <Help title="What each person is responsible for">
          {Object.entries(RESPONSIBILITY_HELP).map(([k, text]) => (
            <p key={k}>
              <strong className="capitalize">{k}: </strong>
              {text}
            </p>
          ))}
          <p>
            HOD and department supervisor use the plan’s department. Confirm the
            supervisor during planning. Line manager uses the relevant
            assignee’s reporting line. “Plan owner” reuses the person already
            confirmed for the plan. “Choose a person during planning” leaves an
            explicit selection for later.
          </p>
          <p>
            These defaults suggest who should take responsibility. Confirm the
            people when creating the plan. The verifier should be different from
            the person supplying the results, and the approver must have
            permission to approve.
          </p>
        </Help>
      </Group>
      <Group title="Measurement & scoring controls">
        <FieldFrame field="directions">
          <fieldset disabled={disabled}>
            <legend className="mb-3 text-sm">
              Available measurement types
            </legend>
            <div className="flex flex-wrap gap-4">
              {DIRECTIONS.map((d) => (
                <label key={d} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.directions.includes(d)}
                    onChange={(e) =>
                      change(
                        "directions",
                        e.target.checked
                          ? [...r.directions, d]
                          : r.directions.filter((x) => x !== d),
                      )
                    }
                  />
                  {directionLabels[d]}
                </label>
              ))}
            </div>
          </fieldset>
        </FieldFrame>
        <Help>
          <p>
            Higher is better: output. Lower is better: waste. Within range: a
            controlled temperature. Milestone: complete a defined deliverable.
            Zero-target: avoid incidents without dividing by a zero target.
          </p>
          <p>
            Area 03 sets each KPI’s targets, weights, formulas and warning
            thresholds. Missing results are not zero. New custom formulas need
            explicit calculation and validation rules; this selection does not
            add untested scoring formulas.
          </p>
        </Help>
      </Group>
    </>
  );
}

function IntervalSummary({
  rules,
  frequency,
}: {
  rules: CalendarRules;
  frequency: "custom" | "twice-monthly";
}) {
  const example = intervalExample(rules, frequency);
  if (!example)
    return (
      <p className={styles.intervalSummary}>
        Complete the dates and interval to see the first periods here.
      </p>
    );
  const reporting = enabledFrequencies(rules).includes(frequency);
  const reviews = rules.reviewFrequency === frequency;
  const noun =
    reporting && reviews
      ? "Reports and reviews"
      : reviews
        ? "Reviews"
        : "Reports";
  return (
    <div
      className={styles.intervalSummary}
      aria-live="polite"
      aria-atomic="true"
    >
      <p>{example.description}</p>
      <p>
        {noun} using this frequency cover{" "}
        {example.periods
          .map(
            (p) =>
              `${dateEntry(p.start)} – ${dateEntry(p.end)}${p.partial ? " (part of a period)" : ""}`,
          )
          .join("; then ")}
        .
      </p>
    </div>
  );
}
