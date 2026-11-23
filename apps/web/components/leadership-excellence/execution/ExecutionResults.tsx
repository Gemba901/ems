"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardPaste, Search } from "lucide-react";
import type {
  ExecutionAssignment,
  ExecutionResult,
  ExecutionHistory,
} from "@/services/leadership-excellence/execution.service";
import {
  actualValue,
  displayNumber,
  editablePeriod,
  entryInputs,
  inputNumber,
  parseResultPaste,
  resultSummary,
  type ResultInput,
} from "@/services/leadership-excellence/execution/helpers";
import { useExecution } from "./ExecutionProvider";
import { useExecutionScope } from "./ExecutionFrame";
import { ExecutionHistoryModal, ExecutionStatus, Metric } from "./ExecutionUi";
import {
  Button,
  card,
  control,
  Empty,
  ErrorList,
  Field,
  Modal,
  frequencies,
} from "../performance-planning/PlanningUi";

const PATH = "/leadership-excellence/execution/results-entry";
const frequencyName = (value: string) =>
  frequencies.find(([key]) => key === value)?.[1] || value;
export function ExecutionResults() {
  const { assignments, scope, cycle } = useExecutionScope();
  const key = useSearchParams().get("assignment");
  const selected = assignments.find((a) => a.key === key);
  if (key && !selected)
    return (
      <Empty
        title="This assignment is not available"
        action={
          <Link
            href={`${PATH}?scope=${scope}&cycle=${encodeURIComponent(cycle)}`}
            className="text-indigo-700 underline"
          >
            Back to all KPIs
          </Link>
        }
      >
        It may belong to a different planning period, department or permission
        scope. Select the matching period above.
      </Empty>
    );
  return selected ? (
    <KpiDetail key={selected.key} entry={selected} />
  ) : (
    <KpiRegister />
  );
}

function KpiRegister() {
  const { data } = useExecution();
  const { assignments, scope, cycle } = useExecutionScope();
  const [search, setSearch] = useState("");
  const current = assignments.filter((a) => a.current);
  const visible = current.filter((a) =>
    `${a.definition.name} ${a.assignment.code} ${a.goalTitle}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (!current.length)
    return (
      <Empty title="No approved KPI assignments yet">
        Your approved KPI assignments and reporting schedules from Performance
        Planning will appear here. Drafts and future-effective plans are not
        active work.
      </Empty>
    );
  return (
    <section className="space-y-4" data-testid="execution-kpi-register">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Assigned KPIs{" "}
            <span className="text-slate-500">({current.length})</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a KPI to see all its reporting periods.
          </p>
        </div>
        <label className="relative w-full max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-4 text-slate-400"
            size={17}
          />
          <input
            aria-label="Search KPIs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${control} pl-9`}
            placeholder="Search KPI or goal…"
          />
        </label>
      </div>
      {!visible.length && <p className={card}>No KPIs match your search.</p>}
      {visible.map((entry) => {
        const summary = resultSummary(entry, data.results, data.today);
        const provider =
          data.references.people.find(
            (p) => p.id === entry.assignment.providerId,
          )?.name || "Not assigned";
        return (
          <article
            key={entry.key}
            className={card}
            data-testid="execution-kpi-assignment"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`${PATH}?scope=${scope}&cycle=${encodeURIComponent(cycle)}&assignment=${encodeURIComponent(entry.key)}`}
                  className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900 hover:text-indigo-700 hover:underline"
                >
                  {entry.definition.name}
                  <ArrowRight size={17} className="shrink-0" />
                </Link>
                <p className="mt-1 text-sm text-slate-500">{entry.goalTitle}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {frequencyName(entry.assignment.updateFrequency)} ·{" "}
                  {entry.periods.length} periods · Approved v{entry.version}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Reports results: {provider}
                  {entry.canEnter ? " · You can enter results" : " · View only"}
                </p>
              </div>
              <div className="flex gap-8 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Approved target</p>
                  <p className="mt-1 font-semibold">
                    {entry.assignment.targetMode === "VARIED"
                      ? "By reporting period"
                      : `${displayNumber(entry.assignment.target)} ${entry.definition.unit}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Verified actual</p>
                  <p className="mt-1 font-semibold">
                    {displayNumber(summary.official)} {entry.definition.unit}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {summary.verified} verified · {summary.submitted} awaiting
                    check
                  </p>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function KpiDetail({ entry }: { entry: ExecutionAssignment }) {
  const { data, run, busy, refresh, setUnsaved } = useExecution();
  const { assignments, scope, cycle } = useExecutionScope();
  const router = useRouter();
  const [month, setMonth] = useState("all");
  const [inputs, setInputs] = useState<Record<string, ResultInput>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [revision, setRevision] = useState(data.revision);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paste, setPaste] = useState(false);
  const [history, setHistory] = useState<{
    title: string;
    history: ExecutionHistory[];
  } | null>(null);
  const dirty = Object.keys(inputs).length > 0;
  useEffect(() => {
    setUnsaved(dirty);
    return () => setUnsaved(false);
  }, [dirty, setUnsaved]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const results = data.results.filter((r) => r.assignmentKey === entry.key);
  const byPeriod = new Map(results.map((r) => [r.periodId, r]));
  const periods = entry.periods.filter(
    (p) => month === "all" || p.start.slice(0, 7) === month,
  );
  const months = [...new Set(entry.periods.map((p) => p.start.slice(0, 7)))];
  const versions = assignments
    .filter(
      (a) =>
        a.documentId === entry.documentId &&
        a.assignment.id === entry.assignment.id,
    )
    .sort((a, b) => b.version - a.version);
  const summary = resultSummary(entry, data.results, data.today, periods);
  const ratio = entry.definition.formula !== "DIRECT";
  const person = (id: string) =>
    data.references.people.find((p) => p.id === id)?.name || "Not assigned";
  const read = (periodId: string) =>
    inputs[periodId] || entryInputs(byPeriod.get(periodId));
  const editable = periods.filter((p) =>
    editablePeriod(entry, p, data.today, byPeriod.get(p.id), data.results),
  );
  function edit(periodId: string, key: keyof ResultInput, value: string) {
    if (!dirty) setRevision(data.revision);
    setInputs((current) => ({
      ...current,
      [periodId]: {
        ...(current[periodId] || entryInputs(byPeriod.get(periodId))),
        [key]: value,
      },
    }));
    setMessage("");
  }
  async function save(submit: boolean) {
    const ids = submit
      ? selected
      : selected.length
        ? selected
        : Object.keys(inputs);
    if (!ids.length) {
      setError(
        submit
          ? "Select the periods you want to submit."
          : "Enter results or select periods to save a draft.",
      );
      return;
    }
    setError("");
    setMessage("");
    try {
      const result = await run(
        submit ? "SUBMIT_RESULTS" : "SAVE_RESULTS",
        {
          assignmentKey: entry.key,
          rows: ids.map((periodId) => {
            const value = read(periodId);
            if (
              (value.inputA.trim() && !Number.isFinite(Number(value.inputA))) ||
              (value.inputB.trim() && !Number.isFinite(Number(value.inputB)))
            )
              throw new Error("Enter valid numeric values before saving.");
            return {
              periodId,
              inputA: inputNumber(value.inputA),
              inputB: ratio ? inputNumber(value.inputB) : null,
              evidence: value.evidence,
              note: value.note,
            };
          }),
        },
        dirty ? revision : data.revision,
      );
      setRevision(result.revision);
      setInputs((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => !ids.includes(id)),
        ),
      );
      setSelected([]);
      setMessage(
        submit
          ? `${ids.length} period(s) submitted for verification. They are not official results yet.`
          : `${ids.length} draft period(s) saved.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the results. Your entries are still here.",
      );
    }
  }
  function switchVersion(value: string) {
    if (
      dirty &&
      !window.confirm(
        "You have unsaved entries. Leave this version without saving them?",
      )
    )
      return;
    router.push(
      `${PATH}?scope=${scope}&cycle=${encodeURIComponent(cycle)}&assignment=${encodeURIComponent(value)}`,
    );
  }
  const aggregationLabel =
    entry.definition.aggregation === "SUM" && !ratio
      ? "Sum of verified values"
      : ["CLOSING", "MILESTONE"].includes(entry.definition.aggregation)
        ? "Latest verified period"
        : "Calculated from combined source figures";
  return (
    <section className="space-y-5" data-testid="execution-kpi-detail">
      <Button
        variant="ghost"
        onClick={() => {
          if (!dirty || window.confirm("Leave without saving your entries?"))
            router.push(
              `${PATH}?scope=${scope}&cycle=${encodeURIComponent(cycle)}`,
            );
        }}
      >
        <ArrowLeft size={16} />
        All KPIs
      </Button>
      <div className={card}>
        <div className="flex flex-wrap justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{entry.definition.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{entry.goalTitle}</p>
            <p className="mt-3 text-sm text-slate-600">
              {entry.definition.meaning}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Reports results: {person(entry.assignment.providerId)} · Checks
              results: {person(entry.assignment.verifierId)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {frequencyName(entry.assignment.updateFrequency)} ·{" "}
              {entry.periods.length} reporting periods ·{" "}
              {entry.assignment.startDate} to {entry.assignment.endDate}
            </p>
          </div>
          <div className="w-full sm:w-56">
            <Field label="Approved version">
              <select
                className={control}
                value={entry.key}
                onChange={(e) => switchVersion(e.target.value)}
              >
                {versions.map((version) => (
                  <option key={version.key} value={version.key}>
                    Version {version.version}
                    {version.current ? " · Current" : " · Historical"}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <details className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <summary className="cursor-pointer text-slate-600">
            Approved measure and schedule
          </summary>
          <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Formula</dt>
              <dd>
                {ratio
                  ? `${entry.definition.inputA || "Numerator"} ÷ ${entry.definition.inputB || "Denominator"}${entry.definition.formula === "PERCENT" ? " × 100" : ""}`
                  : "Direct value"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Aggregation</dt>
              <dd>{aggregationLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Source</dt>
              <dd>{entry.assignment.source || "Not specified"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Calendar</dt>
              <dd>
                {entry.assignment.calendar
                  ? `${entry.assignment.calendar.source.replaceAll("_", " ")} · Version ${entry.assignment.calendar.version} · ${entry.assignment.calendar.timeZone}`
                  : "Approved reporting periods"}
              </dd>
            </div>
          </dl>
        </details>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Verified actual"
          value={`${displayNumber(summary.official)} ${entry.definition.unit}`}
          hint={aggregationLabel}
        />
        <Metric
          label="Including submitted · provisional"
          value={`${displayNumber(summary.provisional)} ${entry.definition.unit}`}
          hint={`${summary.submitted} period(s) awaiting verification`}
        />
        <Metric
          label="Verified reporting"
          value={`${summary.verified} / ${summary.scheduled}`}
          hint={`${summary.elapsed} elapsed reporting periods`}
        />
        <Metric
          label="Overdue entries"
          value={summary.overdue}
          hint="Future and unscheduled periods excluded"
        />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="w-full text-sm font-medium sm:w-64">
          Reporting periods
          <select
            className={control}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="all">All periods ({entry.periods.length})</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01T12:00:00`).toLocaleDateString("en", {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
        </label>
        {entry.canEnter ? (
          <Button
            variant="outline"
            onClick={() => setPaste(true)}
            disabled={busy}
          >
            <ClipboardPaste size={16} />
            Paste from spreadsheet
          </Button>
        ) : (
          <p className="text-sm text-slate-500">
            View only. The assigned reporting person can enter results.
          </p>
        )}
      </div>
      <ErrorList error={error} />
      {error && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const latest = await refresh();
            if (latest) {
              setRevision(latest.revision);
              setMessage(
                "Latest records loaded. Your unsaved entries remain; compare them before retrying.",
              );
            }
          }}
        >
          Reload current records and keep my entries
        </Button>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
        >
          {message}
        </p>
      )}
      <div
        className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 bg-white"
        data-testid="execution-period-table"
      >
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="p-3">
                <input
                  aria-label="Select all editable periods in this view"
                  type="checkbox"
                  checked={
                    editable.length > 0 &&
                    editable.every((p) => selected.includes(p.id))
                  }
                  disabled={!editable.length || busy}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [
                            ...new Set([
                              ...selected,
                              ...editable.map((p) => p.id),
                            ]),
                          ]
                        : selected.filter(
                            (id) => !editable.some((p) => p.id === id),
                          ),
                    )
                  }
                />
              </th>
              {[
                "Reporting period",
                "Approved target",
                ratio ? entry.definition.inputA || "Numerator" : "Actual value",
                ...(ratio ? [entry.definition.inputB || "Denominator"] : []),
                "Calculated actual",
                "Status",
                "Evidence & notes",
              ].map((label, i) => (
                <th key={`${label}:${i}`} className="p-3 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => {
              const result = byPeriod.get(period.id),
                values = read(period.id),
                canEdit = editablePeriod(
                  entry,
                  period,
                  data.today,
                  result,
                  data.results,
                );
              const actual = actualValue(
                entry.definition,
                inputNumber(values.inputA),
                ratio ? inputNumber(values.inputB) : null,
              );
              const future = period.start > data.today,
                scheduled = period.scheduled !== false;
              const otherVersion = data.results.find(
                (r) =>
                  r.periodId === period.id &&
                  r.assignmentKey !== entry.key &&
                  r.assignmentKey.replace(/\/v\d+$/, "") ===
                    entry.key.replace(/\/v\d+$/, ""),
              );
              const overdue =
                scheduled &&
                !future &&
                (period.submissionDate || period.end) < data.today &&
                !result?.official &&
                result?.status !== "SUBMITTED";
              const numericInput = (
                key: "inputA" | "inputB",
                label: string,
              ) => (
                <input
                  aria-label={`${label} for ${period.start}`}
                  className={`${control} mt-0 w-28`}
                  type="number"
                  step="any"
                  value={values[key]}
                  disabled={!canEdit || busy}
                  onChange={(e) => edit(period.id, key, e.target.value)}
                  placeholder="—"
                />
              );
              return (
                <tr
                  key={period.id}
                  className="border-t border-slate-100 align-top"
                  data-testid="execution-result-row"
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${period.label || period.start}`}
                      disabled={!canEdit || busy}
                      checked={selected.includes(period.id)}
                      onChange={(e) =>
                        setSelected((current) =>
                          e.target.checked
                            ? [...current, period.id]
                            : current.filter((id) => id !== period.id),
                        )
                      }
                    />
                  </td>
                  <th scope="row" className="min-w-40 p-3 font-normal">
                    <strong className="block font-medium">
                      {period.label || period.start}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {period.start}
                      {period.end !== period.start ? ` – ${period.end}` : ""}
                    </span>
                    <span
                      className={`mt-1 block text-xs ${overdue ? "text-amber-700" : "text-slate-500"}`}
                    >
                      {!scheduled
                        ? "Not scheduled"
                        : future
                          ? "Future period"
                          : `Due ${period.submissionDate || period.end}${overdue ? " · Overdue" : ""}`}
                    </span>
                  </th>
                  <td className="p-3">
                    <strong className="whitespace-nowrap">
                      {scheduled ? displayNumber(period.target) : "—"}
                      {entry.definition.direction === "RANGE" && scheduled
                        ? ` – ${displayNumber(period.upper)}`
                        : ""}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      {entry.definition.unit}
                    </span>
                  </td>
                  <td className="p-3">
                    {scheduled
                      ? numericInput(
                          "inputA",
                          ratio
                            ? entry.definition.inputA || "Numerator"
                            : "Actual",
                        )
                      : "—"}
                  </td>
                  {ratio && (
                    <td className="p-3">
                      {scheduled
                        ? numericInput(
                            "inputB",
                            entry.definition.inputB || "Denominator",
                          )
                        : "—"}
                    </td>
                  )}
                  <td className="p-3">
                    <strong>{scheduled ? displayNumber(actual) : "—"}</strong>
                    {scheduled && actual != null && period.target != null && (
                      <span className="mt-1 block text-xs text-slate-500">
                        Difference: {displayNumber(actual - period.target)}
                      </span>
                    )}
                  </td>
                  <td className="min-w-36 p-3">
                    <ExecutionStatus
                      status={
                        !scheduled
                          ? "Not scheduled"
                          : !result && !entry.entryPeriodIds.includes(period.id)
                            ? "Use applicable version"
                            : inputs[period.id]
                              ? "Unsaved changes"
                              : result?.status || "No entry"
                      }
                    />
                    {result?.official &&
                      (result.status !== "VERIFIED" || inputs[period.id]) && (
                        <span className="mt-2 block text-xs text-emerald-700">
                          Official {displayNumber(result.official.actual)}{" "}
                          retained
                        </span>
                      )}
                    {otherVersion && (
                      <Link
                        href={`${PATH}?scope=${scope}&cycle=${encodeURIComponent(cycle)}&assignment=${encodeURIComponent(otherVersion.assignmentKey)}`}
                        className="mt-2 block text-xs text-indigo-700 underline"
                      >
                        Open original result version
                      </Link>
                    )}
                    {result?.verificationNote && (
                      <p className="mt-2 text-xs text-amber-800">
                        {result.verificationNote}
                      </p>
                    )}
                  </td>
                  <td className="min-w-64 p-3">
                    {scheduled && (
                      <>
                        <input
                          aria-label={`Evidence for ${period.start}`}
                          className={`${control} mt-0`}
                          value={values.evidence}
                          disabled={!canEdit || busy}
                          placeholder="Evidence reference or link"
                          onChange={(e) =>
                            edit(period.id, "evidence", e.target.value)
                          }
                        />
                        <textarea
                          aria-label={`Notes for ${period.start}`}
                          className={`${control} min-h-10`}
                          rows={1}
                          value={values.note}
                          disabled={!canEdit || busy}
                          placeholder={
                            result?.official
                              ? "Reason for correction (required)"
                              : "Notes"
                          }
                          onChange={(e) =>
                            edit(period.id, "note", e.target.value)
                          }
                        />
                      </>
                    )}
                    <button
                      type="button"
                      className="mt-2 text-xs text-indigo-700 hover:underline"
                      onClick={() =>
                        setHistory({
                          title: `History · ${period.label || period.start}`,
                          history: result?.history || [],
                        })
                      }
                    >
                      History
                      {result?.history.length
                        ? ` (${result.history.length})`
                        : ""}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!periods.length && (
          <p className="p-6 text-slate-500">
            No reporting periods in this view.
          </p>
        )}
      </div>
      {entry.canEnter && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg md:sticky md:bottom-3">
          <div>
            <p className="text-sm font-medium">
              {selected.length} selected · {Object.keys(inputs).length} unsaved
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Submission goes to the assigned verifier in Area 05.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save draft
            </Button>
            <Button
              disabled={busy || !selected.length}
              onClick={() => void save(true)}
            >
              {busy ? "Saving…" : "Submit selected"}
            </Button>
          </div>
        </div>
      )}
      {history && (
        <ExecutionHistoryModal {...history} onClose={() => setHistory(null)} />
      )}
      {paste && (
        <PasteModal
          entry={entry}
          results={data.results}
          onClose={() => setPaste(false)}
          onApply={(rows) => {
            if (!dirty) setRevision(data.revision);
            setInputs((current) => ({
              ...current,
              ...Object.fromEntries(rows.map((r) => [r.periodId, r.inputs])),
            }));
            setSelected((current) => [
              ...new Set([...current, ...rows.map((r) => r.periodId)]),
            ]);
            setPaste(false);
            setMessage(
              "Rows added to your form. Review them, then save draft or submit.",
            );
          }}
        />
      )}
    </section>
  );
}

function PasteModal({
  entry,
  results,
  onClose,
  onApply,
}: {
  entry: ExecutionAssignment;
  results: ExecutionResult[];
  onClose: () => void;
  onApply: (rows: ReturnType<typeof parseResultPaste>) => void;
}) {
  const { data } = useExecution();
  const [text, setText] = useState("");
  const rows = parseResultPaste(text, entry, data.today, results);
  const ratio = entry.definition.formula !== "DIRECT";
  return (
    <Modal
      title="Paste reporting rows"
      onClose={onClose}
      description="Copy tab-separated cells from your spreadsheet. All rows are checked before any are added."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!rows.length || rows.some((r) => r.error)}
            onClick={() => onApply(rows)}
          >
            Use {rows.length || "these"} rows
          </Button>
        </div>
      }
    >
      <p className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
        Columns: Period start (YYYY-MM-DD) ·{" "}
        {ratio
          ? `${entry.definition.inputA || "Numerator"} · ${entry.definition.inputB || "Denominator"}`
          : "Actual value"}{" "}
        · Evidence reference (optional) · Notes (optional)
      </p>
      <Field label="Spreadsheet rows">
        <textarea
          className={`${control} min-h-44 font-mono text-xs`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            ratio
              ? "2027-01-01\t6000\t100\tWaste log\t"
              : "2027-01-01\t12\tDaily log\t"
          }
        />
      </Field>
      <div className="mt-4 max-h-60 overflow-auto">
        {rows.map((row) => (
          <p
            key={row.line}
            className={`border-b border-slate-100 py-2 text-sm ${row.error ? "text-red-700" : "text-emerald-700"}`}
          >
            Row {row.line} · {row.date || "Missing date"}:{" "}
            {row.error || "Ready"}
          </p>
        ))}
      </div>
    </Modal>
  );
}
