"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type {
  IntelligenceFavourability,
  IntelligenceMeasure,
  IntelligencePeriodStatus,
  IntelligenceView,
} from "@/services/leadership-excellence/performance-intelligence/types";
import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import {
  calendarDateLabel,
  calendarPeriodLabel,
} from "@/services/leadership-excellence/calendar-display";
import { Button, card, Modal } from "../performance-planning/PlanningUi";
import { useLexPlanningPeriod } from "../LexPlanningPeriod";

const numberFormat = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 4,
});
const cell = "px-4 py-3 align-top";
const head = "px-4 py-3 text-left text-xs font-semibold text-slate-600";
const directions: Record<string, string> = {
  HIGHER: "Higher is better",
  LOWER: "Lower is better",
  RANGE: "Within the target range",
  ZERO: "Zero is the target",
  MILESTONE: "Milestone achieved",
  MAINTAIN_MIN: "Maintain the minimum target",
  MAINTAIN_MAX: "Stay within the maximum target",
};
const aggregations: Record<string, string> = {
  SUM: "Sum of source values",
  RATIO: "Combined source figures, then calculate the ratio",
  CLOSING: "Closing value",
  MILESTONE: "Milestone completion",
  LATEST_VERIFIED_PERIOD: "Latest verified reporting period",
};
const statuses: Record<IntelligencePeriodStatus, string> = {
  VERIFIED: "Verified",
  SUBMITTED: "Submitted · unverified",
  DRAFT: "Draft · unverified",
  RETURNED: "Returned · unverified",
  MISSING: "Missing",
  NOT_DUE: "Not due",
  NOT_SCHEDULED: "Not scheduled",
};

export function intelligenceNumber(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : numberFormat.format(value);
}

export function intelligenceTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("en-GB", { timeZoneName: "short" })
    : "—";
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warning" | "bad";
}) {
  const colours = {
    neutral: "bg-slate-100 text-slate-600",
    good: "bg-emerald-50 text-emerald-800",
    warning: "bg-amber-50 text-amber-900",
    bad: "bg-rose-50 text-rose-800",
  };
  return (
    <span
      data-report-badge
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${colours[tone]}`}
    >
      {children}
    </span>
  );
}

function Target({
  value,
  upper,
}: {
  value: number | null;
  upper: number | null;
}) {
  return (
    <span className="tabular-nums">
      {intelligenceNumber(value)}
      {value !== null && upper !== null
        ? ` – ${intelligenceNumber(upper)}`
        : ""}
    </span>
  );
}

function Favourability({ value }: { value: IntelligenceFavourability }) {
  if (value === "UNKNOWN") return null;
  return (
    <Badge tone={value === "UNFAVOURABLE" ? "bad" : "good"}>
      {value === "ON_TARGET"
        ? "On target"
        : value === "FAVOURABLE"
          ? "Favourable"
          : "Unfavourable"}
    </Badge>
  );
}

function Coverage({ measure }: { measure: IntelligenceMeasure }) {
  const coverage = measure.coverage;
  return (
    <div className="space-y-1.5">
      <p className="font-medium text-slate-700">
        {coverage.verified} / {coverage.scheduled} verified
      </p>
      <p className="text-xs text-slate-500">
        {coverage.due} due · {coverage.notDue} not due
      </p>
      <div className="flex flex-wrap gap-1">
        {coverage.partial && <Badge tone="warning">Partial</Badge>}
        {coverage.missing > 0 && (
          <Badge tone="warning">{coverage.missing} missing</Badge>
        )}
        {coverage.submitted > 0 && (
          <Badge tone="warning">
            {coverage.submitted} awaiting verification
          </Badge>
        )}
        {coverage.correctionPending > 0 && (
          <Badge tone="warning">
            {coverage.correctionPending} correction pending
          </Badge>
        )}
        {coverage.notScheduled > 0 && (
          <Badge>{coverage.notScheduled} not scheduled</Badge>
        )}
      </div>
    </div>
  );
}

function Trend({ measure }: { measure: IntelligenceMeasure }) {
  if (!measure.trend.length) return <span className="text-slate-400">—</span>;
  if (measure.trend.length === 1)
    return <span className="text-xs text-slate-500">1 verified point</span>;
  const first = measure.trend[0];
  const last = measure.trend[measure.trend.length - 1];
  return (
    <div
      className="text-xs"
      title={`${calendarDateLabel(first.end)} to ${calendarDateLabel(last.end)}`}
    >
      <p className="whitespace-nowrap font-medium tabular-nums text-slate-700">
        {intelligenceNumber(first.actual)} → {intelligenceNumber(last.actual)}
      </p>
      <p className="mt-1 text-slate-500">First → latest verified</p>
      <p className="mt-1 text-slate-500">{measure.trend.length} periods</p>
    </div>
  );
}

export function MeasureTable({
  title,
  description,
  measures,
  onSelect,
}: {
  title: string;
  description: string;
  measures: IntelligenceMeasure[];
  onSelect: (key: string) => void;
}) {
  return (
    <section className={`${card} !p-0 overflow-hidden`}>
      <div className="px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">
          {title}{" "}
          <span className="font-normal text-slate-500">
            ({measures.length})
          </span>
        </h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {!measures.length ? (
        <p className="border-t border-slate-100 px-4 py-8 text-sm text-slate-500 sm:px-6">
          No approved measures match these filters.
        </p>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-label={title}
          tabIndex={0}
        >
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-y border-slate-200 bg-slate-50">
              <tr>
                {[
                  "Measure",
                  "Comparable target",
                  "Verified actual",
                  "Gap",
                  "Trend",
                  "Completeness",
                ].map((label) => (
                  <th key={label} scope="col" className={head}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {measures.map((measure) => (
                <tr key={measure.key} className="hover:bg-slate-50/60">
                  <td className={`${cell} min-w-64 max-w-96`}>
                    <button
                      type="button"
                      className="text-left font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-indigo-500"
                      onClick={() => onSelect(measure.key)}
                    >
                      {measure.name}
                    </button>
                    <p className="mt-1 text-xs text-slate-500">
                      {measure.code} · {measure.unit || "No unit"} ·{" "}
                      {planningPeriodLabel(measure.cycle)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {[measure.departmentName, measure.personName]
                        .filter(Boolean)
                        .join(" · ") || measure.scope}
                    </p>
                    {measure.source === "AREA_03_MEASURED_RESULT" && (
                      <div className="mt-2">
                        <Badge>
                          {measure.scope.slice(0, 1) +
                            measure.scope.slice(1).toLowerCase()}{" "}
                          measure
                        </Badge>
                      </div>
                    )}
                    {!measure.current && (
                      <div className="mt-2">
                        <Badge>Earlier approved version</Badge>
                      </div>
                    )}
                  </td>
                  <td className={cell}>
                    <Target
                      value={measure.comparableTarget}
                      upper={measure.comparableUpper}
                    />
                  </td>
                  <td className={`${cell} font-semibold tabular-nums`}>
                    {intelligenceNumber(measure.officialActual)}
                  </td>
                  <td className={cell}>
                    <div className="space-y-2">
                      <p className="tabular-nums">
                        {intelligenceNumber(measure.gap)}
                      </p>
                      <Favourability value={measure.favourability} />
                    </div>
                  </td>
                  <td className={cell}>
                    <Trend measure={measure} />
                  </td>
                  <td className={`${cell} min-w-48`}>
                    <Coverage measure={measure} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function IntelligenceMetrics({ data }: { data: IntelligenceView }) {
  const metrics = [
    ["KPIs", data.summary.kpis, "Approved assignments"],
    [
      "Verified periods",
      data.summary.verifiedPeriods,
      `${data.summary.submittedPeriods} awaiting verification`,
    ],
    [
      "Missing results",
      data.summary.missingPeriods,
      `${data.summary.correctionPending} corrections pending`,
    ],
    [
      "On / favourable to target",
      data.summary.atOrAboveTarget,
      `${data.summary.belowTarget} unfavourable · ${data.summary.incomparable} not comparable`,
    ],
  ] as const;
  return (
    <div
      data-report-metrics
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {metrics.map(([label, value, hint]) => (
        <div key={label} data-report-metric className={`${card} !p-4`}>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <strong className="mt-2 block text-3xl font-semibold tabular-nums text-slate-900">
            {value}
          </strong>
          <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p>
        </div>
      ))}
    </div>
  );
}

export function DeliveryTables({ data }: { data: IntelligenceView }) {
  return (
    <div className="space-y-5">
      <section className={`${card} !p-0 overflow-hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">
              Delivery actions{" "}
              <span className="font-normal text-slate-500">
                ({data.summary.actions})
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Action progress is tracked separately from measured KPI results.
            </p>
          </div>
          <Badge tone={data.summary.overdueActions ? "warning" : "neutral"}>
            {data.summary.overdueActions} overdue
          </Badge>
        </div>
        {!data.actions.length ? (
          <p className="border-t border-slate-100 px-4 py-6 text-sm text-slate-500 sm:px-6">
            No actions match these filters.
          </p>
        ) : (
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Delivery actions"
            tabIndex={0}
          >
            <table className="w-full min-w-[650px] text-sm">
              <thead className="border-y border-slate-200 bg-slate-50">
                <tr>
                  {["Action", "Owner", "Due", "Progress", "Status"].map(
                    (label) => (
                      <th key={label} scope="col" className={head}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.actions.map((action) => (
                  <tr key={action.key}>
                    <td className={`${cell} max-w-96`}>
                      <Link
                        href={action.sourceHref}
                        prefetch={false}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {action.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {action.goalTitle}
                      </p>
                    </td>
                    <td className={cell}>{action.ownerName || "—"}</td>
                    <td className={cell}>
                      {calendarDateLabel(action.dueDate)}
                      {action.overdue && (
                        <div className="mt-1">
                          <Badge tone="warning">Overdue</Badge>
                        </div>
                      )}
                    </td>
                    <td className={`${cell} tabular-nums`}>
                      {intelligenceNumber(action.progress)}%
                    </td>
                    <td className={cell}>
                      <Badge>
                        {action.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className={`${card} !p-0 overflow-hidden`}>
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">Support requests</h2>
            <p className="mt-1 text-sm text-slate-500">
              {data.summary.openSupport} open ·{" "}
              {data.summary.unacknowledgedSupport} awaiting acknowledgement
            </p>
          </div>
          <Badge>{data.support.length} requests</Badge>
        </div>
        {!data.support.length ? (
          <p className="border-t border-slate-100 px-4 py-6 text-sm text-slate-500 sm:px-6">
            No support requests match these filters.
          </p>
        ) : (
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Support requests"
            tabIndex={0}
          >
            <table className="w-full min-w-[650px] text-sm">
              <thead className="border-y border-slate-200 bg-slate-50">
                <tr>
                  {[
                    "Request",
                    "Assigned to",
                    "Due",
                    "Acknowledgement",
                    "Status",
                  ].map((label) => (
                    <th key={label} scope="col" className={head}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.support.map((request) => (
                  <tr key={request.id}>
                    <td className={`${cell} max-w-96`}>
                      <Link
                        href={request.sourceHref}
                        prefetch={false}
                        className="font-medium text-indigo-700 hover:underline"
                      >
                        {request.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.goalTitle}
                      </p>
                    </td>
                    <td className={cell}>{request.assignedToName || "—"}</td>
                    <td className={cell}>
                      {calendarDateLabel(request.dueDate)}
                      {request.overdue && (
                        <div className="mt-1">
                          <Badge tone="warning">Overdue</Badge>
                        </div>
                      )}
                    </td>
                    <td className={cell}>
                      {request.acknowledgedAt
                        ? intelligenceTime(request.acknowledgedAt)
                        : "Not acknowledged"}
                    </td>
                    <td className={cell}>
                      <Badge>
                        {request.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function MeasureDetail({
  measure,
  onClose,
}: {
  measure: IntelligenceMeasure;
  onClose: () => void;
}) {
  const { setCycle } = useLexPlanningPeriod();
  const definition = measure.definition;
  const formula = definition
    ? definition.formula === "DIRECT"
      ? definition.inputA || "Direct value"
      : `${definition.inputA || "Numerator"} ÷ ${definition.inputB || "Denominator"}${definition.formula === "PERCENT" ? " × 100" : ""}`
    : "";
  return (
    <Modal
      title={measure.name}
      description={`${measure.code} · ${planningPeriodLabel(measure.cycle)} · Approved plan version ${measure.version}`}
      onClose={onClose}
      wide
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            {measure.source === "AREA_04_KPI"
              ? "Area 04 · Performance execution"
              : "Area 03 · Performance planning"}
          </span>
          <Button
            nativeButton={false}
            variant="outline"
            render={
              <Link
                href={measure.sourceHref}
                prefetch={false}
                onClick={() => setCycle(measure.cycle)}
              />
            }
          >
            {measure.source === "AREA_04_KPI"
              ? "Open source record"
              : "Open planning results"}{" "}
            <ArrowUpRight size={16} />
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Actual definition</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
            {definition?.meaning ||
              measure.measurementDefinition ||
              "No measurement definition recorded."}
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Unit</dt>
              <dd className="mt-1">{measure.unit || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Direction</dt>
              <dd className="mt-1">
                {directions[measure.direction] || measure.direction || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Calculation</dt>
              <dd className="mt-1">
                {formula || measure.measurementDefinition || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Period aggregation</dt>
              <dd className="mt-1">
                {aggregations[measure.aggregation] ||
                  measure.aggregation ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Measurement source</dt>
              <dd className="mt-1 whitespace-pre-line">
                {measure.measurementSource || definition?.dataSource || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Linked goal</dt>
              <dd className="mt-1">{measure.goalTitle || "—"}</dd>
            </div>
          </dl>
        </section>
        <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Comparable target</p>
            <p className="mt-1 text-lg font-semibold">
              <Target
                value={measure.comparableTarget}
                upper={measure.comparableUpper}
              />
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Verified actual</p>
            <p className="mt-1 text-lg font-semibold">
              {intelligenceNumber(measure.officialActual)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Gap</p>
            <p className="my-1 text-lg font-semibold">
              {intelligenceNumber(measure.gap)}
            </p>
            <Favourability value={measure.favourability} />
          </div>
        </div>
        {measure.comparisonNote && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {measure.comparisonNote}
          </p>
        )}
        <Coverage measure={measure} />
        <section>
          <h3 className="font-semibold">Source periods</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Verified actuals remain official while a correction awaits
            verification. Provisional values are shown separately.
          </p>
          {!measure.periods.length ? (
            <p className="mt-4 text-sm text-slate-500">
              No source periods are available for this filter.
            </p>
          ) : (
            <div
              className="mt-3 overflow-x-auto rounded-lg border border-slate-200"
              role="region"
              aria-label="Source periods"
              tabIndex={0}
            >
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {[
                      "Period / due",
                      "Target",
                      "Verified actual",
                      "Provisional actual",
                      "Source inputs",
                      "Gap",
                      "Verification",
                    ].map((label) => (
                      <th key={label} scope="col" className={head}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {measure.periods.map((period) => (
                    <tr key={period.id}>
                      <td className={`${cell} min-w-48`}>
                        <p className="font-medium">
                          {calendarPeriodLabel(period)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Due {calendarDateLabel(period.dueDate)}
                          {period.submissionTime
                            ? ` · ${period.submissionTime}${period.submissionTimeZone ? ` ${period.submissionTimeZone}` : ""}`
                            : ""}
                        </p>
                        {period.partial && (
                          <div className="mt-1">
                            <Badge tone="warning">Partial period</Badge>
                          </div>
                        )}
                      </td>
                      <td className={cell}>
                        <Target value={period.target} upper={period.upper} />
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        {intelligenceNumber(period.officialActual)}
                      </td>
                      <td className={`${cell} tabular-nums`}>
                        {intelligenceNumber(period.provisionalActual)}
                      </td>
                      <td className={`${cell} text-xs`}>
                        <p>
                          {definition?.inputA ||
                            (definition ? "Input A" : "Numerator")}
                          : {intelligenceNumber(period.inputA)}
                        </p>
                        {definition?.formula !== "DIRECT" && (
                          <p className="mt-1">
                            {definition?.inputB ||
                              (definition ? "Input B" : "Denominator")}
                            : {intelligenceNumber(period.inputB)}
                          </p>
                        )}
                      </td>
                      <td className={cell}>
                        <p className="mb-1 tabular-nums">
                          {intelligenceNumber(period.gap)}
                        </p>
                        <Favourability value={period.favourability} />
                      </td>
                      <td className={`${cell} min-w-44`}>
                        <Badge
                          tone={
                            period.status === "VERIFIED"
                              ? "good"
                              : [
                                    "DRAFT",
                                    "SUBMITTED",
                                    "RETURNED",
                                    "MISSING",
                                  ].includes(period.status)
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {statuses[period.status]}
                        </Badge>
                        {period.correctionPending && (
                          <div className="mt-1">
                            <Badge tone="warning">Correction pending</Badge>
                          </div>
                        )}
                        {period.verifiedAt && (
                          <p className="mt-2 text-xs text-slate-500">
                            Verified {intelligenceTime(period.verifiedAt)}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
