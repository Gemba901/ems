"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import {
  PerformancePlanningService,
  type Frequency,
  type PlanningCalendar,
  type PlanningDocument,
} from "@/services/leadership-excellence/performance-planning.service";
import {
  assignmentDraftPeriods,
  mergeAssignmentPeriods,
  serializeAssignmentRows,
  type ProgrammeAssignmentDraftRow,
} from "@/services/leadership-excellence/performance-planning/individual-kpi-draft";
import { usePlanning } from "./PlanningProvider";
import { Button, control, ErrorList, Field, frequencies } from "./PlanningUi";

export {
  initAssignmentRows,
  serializeAssignmentRows,
} from "@/services/leadership-excellence/performance-planning/individual-kpi-draft";
export type { ProgrammeAssignmentDraftRow } from "@/services/leadership-excellence/performance-planning/individual-kpi-draft";

const directionNames: Record<string, string> = {
  HIGHER: "Higher is better",
  LOWER: "Lower is better",
  RANGE: "Within a range",
  ZERO: "Zero",
  MILESTONE: "Milestone achieved",
};
const valueOf = (row: ProgrammeAssignmentDraftRow, key: string) =>
  String(row.data[key] ?? "");
const scheduleKey = (
  row: ProgrammeAssignmentDraftRow,
  start: string,
  end: string,
) =>
  JSON.stringify([
    row.data.startDate,
    row.data.endDate,
    row.data.updateFrequency,
    row.data.calendar,
    row.data.useCurrentCalendar,
    start,
    end,
  ]);

export type ProgrammeIndividualKpisProps = {
  assignments: ProgrammeAssignmentDraftRow[];
  onChange: (rows: ProgrammeAssignmentDraftRow[]) => void;
  goalId?: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  document?: PlanningDocument;
  readOnly: boolean;
  onCreateDefinition?: () => void;
};

/** This edits the surrounding goal draft. It never writes an assignment alone. */
export function ProgrammeIndividualKpis({
  assignments,
  onChange,
  goalId,
  ownerId,
  startDate,
  endDate,
  document,
  readOnly,
  onCreateDefinition,
}: ProgrammeIndividualKpisProps) {
  const { data, busy } = usePlanning();
  const keyPrefix = useId(),
    nextKey = useRef(1);
  const latest = useRef({ assignments, onChange });
  useEffect(() => {
    latest.current = { assignments, onChange };
  }, [assignments, onChange]);
  const changeRow = (key: string, row: ProgrammeAssignmentDraftRow) => {
    const current = latest.current;
    // A completed calendar request cannot reinsert a removed KPI row.
    if (!current.assignments.some((item) => item.key === key)) return;
    current.onChange(
      current.assignments.map((item) => (item.key === key ? row : item)),
    );
  };
  const add = () => {
    if (readOnly || busy) return;
    const key = `${keyPrefix}-kpi-${nextKey.current++}`;
    onChange([
      ...assignments,
      {
        key,
        data: {
          goalId: goalId || "",
          definitionId: "",
          ownerId,
          providerId: "",
          verifierId: "",
          source: "",
          baseline: "",
          baselineReason: "",
          startDate,
          endDate,
          updateFrequency: "MONTHLY",
          reviewFrequency: "MONTHLY",
          targetMode: "SAME",
          target: "",
          upper: "",
          targets: [],
          ...(data.references.calendar
            ? { calendar: structuredClone(data.references.calendar) }
            : {}),
        },
        badNumbers: {},
      },
    ]);
  };
  return (
    <details
      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
      data-individual-kpis
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        KPI assignments{" "}
        <span className="ml-1 font-normal text-slate-500">
          ({assignments.length})
        </span>
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs leading-5 text-slate-500">
          Assign shared KPIs to this goal. Set their responsibilities and
          reporting targets here; they save together with the individual plan.
        </p>
        {!assignments.length && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            No KPIs assigned to this goal yet.
          </p>
        )}
        {assignments.map((row, index) => (
          <AssignmentFields
            key={row.key}
            row={row}
            index={index}
            onChange={(next) => changeRow(row.key, next)}
            onRemove={() =>
              onChange(assignments.filter((item) => item.key !== row.key))
            }
            goalStart={startDate}
            goalEnd={endDate}
            document={document}
            readOnly={readOnly}
          />
        ))}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || assignments.length >= 50}
              onClick={add}
            >
              <Plus size={15} />
              Add KPI
            </Button>
            {onCreateDefinition && (
              <Button
                type="button"
                variant="link"
                disabled={busy}
                onClick={onCreateDefinition}
              >
                Create KPI definition
              </Button>
            )}
          </div>
        )}
        {!data.definitions.length && (
          <p className="text-xs leading-5 text-slate-500">
            No KPI definitions are available in the shared library.
            {onCreateDefinition
              ? " Create a definition once, then select it here."
              : " Ask an authorised planner to create the required definition in the shared KPI library."}
          </p>
        )}
      </div>
    </details>
  );
}

function AssignmentFields({
  row,
  index,
  onChange,
  onRemove,
  goalStart,
  goalEnd,
  document,
  readOnly,
}: {
  row: ProgrammeAssignmentDraftRow;
  index: number;
  onChange: (row: ProgrammeAssignmentDraftRow) => void;
  onRemove: () => void;
  goalStart: string;
  goalEnd: string;
  document?: PlanningDocument;
  readOnly: boolean;
}) {
  const { data, busy } = usePlanning();
  const token = useAuthStore((state) => state.accessToken);
  const [error, setError] = useState(""),
    [generating, setGenerating] = useState(false),
    [shown, setShown] = useState(12);
  const latest = useRef({ row, onChange, goalStart, goalEnd });
  const mounted = useRef(true);
  useEffect(() => {
    latest.current = { row, onChange, goalStart, goalEnd };
  }, [row, onChange, goalStart, goalEnd]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const disabled = readOnly || busy || generating;
  const definition = data.definitions.find(
    (item) => item.id === row.data.definitionId,
  );
  const kra = data.kras.find((item) => item.id === definition?.kraId);
  const range = definition?.direction === "RANGE";
  const calendar = row.data.calendar as PlanningCalendar | undefined;
  const currentCalendar = data.references.calendar;
  const periods = assignmentDraftPeriods(row);
  const datesOutsideGoal =
    (!!goalStart &&
      !!valueOf(row, "startDate") &&
      valueOf(row, "startDate") < goalStart) ||
    (!!goalEnd &&
      !!valueOf(row, "endDate") &&
      valueOf(row, "endDate") > goalEnd);
  const change = (key: string, value: unknown, badNumber?: boolean) =>
    onChange({
      ...row,
      data: { ...row.data, [key]: value },
      ...(badNumber === undefined
        ? {}
        : { badNumbers: { ...row.badNumbers, [key]: badNumber } }),
    });
  const calendarChange = (key: string, value: unknown, badNumber?: boolean) =>
    onChange({
      ...row,
      data: {
        ...row.data,
        calendar: { ...(calendar || currentCalendar), [key]: value },
      },
      ...(badNumber === undefined
        ? {}
        : {
            badNumbers: { ...row.badNumbers, [`calendar.${key}`]: badNumber },
          }),
    });
  const input = (key: string, label: string, type = "text", hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        className={control}
        type={type}
        value={valueOf(row, key)}
        step={type === "number" ? "any" : undefined}
        min={type === "date" ? goalStart || undefined : undefined}
        max={type === "date" ? goalEnd || undefined : undefined}
        onChange={(event) =>
          change(
            key,
            event.target.value,
            type === "number" ? event.target.validity.badInput : undefined,
          )
        }
      />
    </Field>
  );
  const select = (
    key: string,
    label: string,
    options: { id: string; name: string }[],
  ) => (
    <Field label={label}>
      <select
        className={control}
        value={valueOf(row, key)}
        onChange={(event) => change(key, event.target.value)}
      >
        <option value="">Select…</option>
        {valueOf(row, key) &&
          !options.some((option) => option.id === valueOf(row, key)) && (
            <option value={valueOf(row, key)}>
              Saved selection · currently unavailable
            </option>
          )}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </Field>
  );
  const people = data.references.people.map((person) => ({
    id: person.id,
    name: `${person.name} · ${person.position}`,
  }));
  async function generate() {
    if (disabled) return;
    const start = valueOf(row, "startDate"),
      end = valueOf(row, "endDate");
    if (!token || !start || !end || start > end) {
      setError(
        "Choose valid KPI start and end dates before generating periods.",
      );
      return;
    }
    if (datesOutsideGoal) {
      setError(
        "Keep the KPI dates within this goal’s period before generating periods.",
      );
      return;
    }
    const signature = scheduleKey(row, goalStart, goalEnd);
    setGenerating(true);
    setError("");
    try {
      const payload = serializeAssignmentRows([row])[0].data;
      const requestedCalendar = payload.calendar as
        | PlanningCalendar
        | undefined;
      const generated = await PerformancePlanningService.periods(
        token,
        start,
        end,
        valueOf(row, "updateFrequency") as Frequency,
        {
          weekStart: requestedCalendar?.weekStart,
          fortnightAnchor: requestedCalendar?.fortnightAnchor,
          twiceMonthlySplit: requestedCalendar?.twiceMonthlySplit,
          submissionDueDays: requestedCalendar?.submissionDueDays,
          documentId: document?.id,
          assignmentId: row.id,
          useCurrentCalendar: row.data.useCurrentCalendar === true,
        },
      );
      if (!mounted.current) return;
      const current = latest.current;
      if (
        signature !==
        scheduleKey(current.row, current.goalStart, current.goalEnd)
      ) {
        setError(
          "The goal or KPI dates changed. Generate the periods again for the updated dates.",
        );
        return;
      }
      current.onChange({
        ...current.row,
        data: {
          ...current.row.data,
          targets: mergeAssignmentPeriods(
            assignmentDraftPeriods(current.row),
            generated,
          ),
        },
      });
      setShown(12);
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not generate reporting periods.",
        );
    } finally {
      if (mounted.current) setGenerating(false);
    }
  }
  return (
    <fieldset
      disabled={disabled}
      data-kpi-assignment={row.key}
      className="min-w-0 space-y-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">
          KPI {index + 1}
          {definition ? ` · ${definition.name}` : ""}
        </h4>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove KPI ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 size={14} />
            Remove KPI
          </Button>
        )}
      </div>
      <ErrorList error={error} />
      {select(
        "definitionId",
        "KRA / KPI definition",
        data.definitions.map((item) => ({
          id: item.id,
          name: `${data.kras.find((area) => area.id === item.kraId)?.name || "Shared KPI"} / ${item.name} · ${item.code}`,
        })),
      )}
      {definition && (
        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-medium text-slate-800">
            {kra?.name || "Shared responsibility area"} · {definition.name}
          </p>
          <p className="mt-1">{definition.meaning}</p>
          <p className="mt-1">
            Unit: {definition.unit} ·{" "}
            {directionNames[definition.direction] || definition.direction}
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">
              Calculation & aggregation
            </summary>
            <p className="mt-2">
              {definition.formula === "DIRECT"
                ? definition.inputA
                : `${definition.inputA} ÷ ${definition.inputB}${definition.formula === "PERCENT" ? " × 100" : ""}`}{" "}
              · {definition.aggregation}
            </p>
          </details>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {select("ownerId", "Accountable KPI owner", people)}
        {input("source", "KPI data source")}
        {select("providerId", "Data provider", people)}
        {select("verifierId", "Independent verifier", people)}
        {input(
          "baseline",
          "KPI baseline",
          "number",
          "Leave empty if it has not been measured. Zero is a measured value.",
        )}
        {valueOf(row, "baseline").trim() === "" &&
          input("baselineReason", "Why the baseline is unavailable")}
        {input("startDate", "KPI start date", "date")}
        {input("endDate", "KPI end date", "date")}
      </div>
      {!!valueOf(row, "providerId") &&
        valueOf(row, "providerId") === valueOf(row, "verifierId") && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            Choose a different independent verifier before approval. You can
            still save this draft.
          </p>
        )}
      {datesOutsideGoal && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          KPI dates must fit the goal period ({goalStart || "start not set"} to{" "}
          {goalEnd || "end not set"}). Your entered dates have not been changed.
        </p>
      )}
      <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
        {select(
          "updateFrequency",
          "Result update frequency",
          frequencies.map(([id, name]) => ({ id, name })),
        )}
        {select(
          "reviewFrequency",
          "Management review frequency",
          frequencies.map(([id, name]) => ({ id, name })),
        )}
      </div>
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">
          Reporting calendar & submission deadline
        </summary>
        <div className="mt-3 space-y-4">
          {row.id && (
            <label className="flex items-start gap-2 text-xs leading-5">
              <input
                className="mt-1"
                type="checkbox"
                checked={row.data.useCurrentCalendar === true}
                onChange={(event) =>
                  onChange({
                    ...row,
                    data: {
                      ...row.data,
                      useCurrentCalendar: event.target.checked,
                      calendar: event.target.checked
                        ? currentCalendar
                          ? structuredClone(currentCalendar)
                          : undefined
                        : row.savedCalendar
                          ? structuredClone(row.savedCalendar)
                          : currentCalendar,
                      targets: event.target.checked
                        ? []
                        : structuredClone(row.savedTargets || []),
                    },
                    badNumbers: Object.fromEntries(
                      Object.entries(row.badNumbers || {}).filter(
                        ([key]) => !key.startsWith("calendar."),
                      ),
                    ),
                  })
                }
              />
              <span>
                Use the current organisation calendar
                <span className="block text-slate-500">
                  Changing calendars clears the generated grid. Generate it
                  again and review targets before saving.
                </span>
              </span>
            </label>
          )}
          <p className="text-xs leading-5 text-slate-500">
            {calendar?.source === "AREA_02"
              ? `Approved organisation calendar · version ${calendar.version}`
              : "Uses organisation work settings and recorded holidays."}{" "}
            ·{" "}
            {calendar?.timeZone ||
              data.references.timeZone ||
              "Organisation time zone"}
          </p>
          {calendar && (
            <fieldset
              disabled={calendar.source === "AREA_02"}
              className="grid min-w-0 gap-3 sm:grid-cols-2"
            >
              <Field label="Week starts on">
                <select
                  className={control}
                  value={calendar.weekStart ?? ""}
                  onChange={(event) =>
                    calendarChange("weekStart", Number(event.target.value))
                  }
                >
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, value) => (
                    <option key={value} value={value}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Every-two-weeks anchor date">
                <input
                  className={control}
                  type="date"
                  value={calendar.fortnightAnchor || ""}
                  onChange={(event) =>
                    calendarChange("fortnightAnchor", event.target.value)
                  }
                />
              </Field>
              <Field label="Twice-monthly first period ends on day">
                <input
                  className={control}
                  type="number"
                  min={1}
                  max={28}
                  value={calendar.twiceMonthlySplit ?? ""}
                  onChange={(event) =>
                    calendarChange(
                      "twiceMonthlySplit",
                      event.target.value,
                      event.target.validity.badInput,
                    )
                  }
                />
              </Field>
              <Field label="Submit within days after the period ends">
                <input
                  className={control}
                  type="number"
                  min={0}
                  max={365}
                  value={calendar.submissionDueDays ?? ""}
                  onChange={(event) =>
                    calendarChange(
                      "submissionDueDays",
                      event.target.value,
                      event.target.validity.badInput,
                    )
                  }
                />
              </Field>
            </fieldset>
          )}
          <p className="text-xs leading-5 text-slate-500">
            Daily non-working dates are Not scheduled. Their targets remain
            empty, never zero. Saved assignments retain their calendar version.
          </p>
        </div>
      </details>
      {select("targetMode", "Period target method", [
        { id: "SAME", name: "Same target for every period" },
        { id: "VARIED", name: "Set each period separately" },
      ])}
      {row.data.targetMode === "SAME" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {input(
            "target",
            range ? "Lower limit" : "Target for each period",
            "number",
          )}
          {range && input("upper", "Upper limit", "number")}
        </div>
      ) : (
        <div className="space-y-3">
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void generate()}
            >
              <RefreshCw
                size={14}
                className={generating ? "animate-spin" : ""}
              />
              {generating
                ? "Generating periods…"
                : "Generate / refresh periods"}
            </Button>
          )}
          {!periods.length && (
            <p className="text-xs text-slate-500">
              Generate reporting periods from this KPI’s dates and update
              frequency, then enter each target.
            </p>
          )}
          <div className="space-y-3">
            {periods.slice(0, shown).map((period, periodIndex) => (
              <div
                key={period.id}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3"
              >
                <div className="self-center text-xs">
                  <span className="font-medium text-slate-800">
                    {period.label}
                  </span>
                  <span className="mt-1 block text-slate-500">
                    {period.start} – {period.end}
                  </span>
                  <span className="mt-1 block text-slate-500">
                    {period.scheduled === false
                      ? "Not scheduled"
                      : period.submissionDate
                        ? `Submit by ${period.submissionDate}`
                        : ""}
                  </span>
                </div>
                <Field
                  label={`${range ? "Lower limit" : "Target"} ${period.label}`}
                >
                  <input
                    className={control}
                    type="number"
                    step="any"
                    disabled={period.scheduled === false}
                    value={period.scheduled === false ? "" : period.target}
                    onChange={(event) =>
                      change(
                        "targets",
                        periods.map((item, targetIndex) =>
                          periodIndex === targetIndex
                            ? {
                                ...item,
                                target: event.target.value,
                                badTarget: event.target.validity.badInput,
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                {range && (
                  <Field label={`Upper limit ${period.label}`}>
                    <input
                      className={control}
                      type="number"
                      step="any"
                      disabled={period.scheduled === false}
                      value={period.scheduled === false ? "" : period.upper}
                      onChange={(event) =>
                        change(
                          "targets",
                          periods.map((item, targetIndex) =>
                            periodIndex === targetIndex
                              ? {
                                  ...item,
                                  upper: event.target.value,
                                  badUpper: event.target.validity.badInput,
                                }
                              : item,
                          ),
                        )
                      }
                    />
                  </Field>
                )}
              </div>
            ))}
          </div>
          {periods.length > shown && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShown((count) => count + 12)}
            >
              Show 12 more periods
            </Button>
          )}
          {periods.length > 0 && (
            <p className="text-xs text-slate-500">
              Showing {Math.min(shown, periods.length)} of {periods.length}{" "}
              periods. Every period is retained when you save.
            </p>
          )}
        </div>
      )}
      <p className="text-xs leading-5 text-slate-500">
        Targets are entered for each reporting period. An annual target is never
        divided automatically. Complete the definition, people, evidence and
        targets before approving the plan.
      </p>
    </fieldset>
  );
}
