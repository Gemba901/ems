"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateOnly } from "@/lib/work/format";
import { useAuthStore } from "@/store/auth.store";
import { PerformancePlanningService } from "@/services/leadership-excellence/performance-planning.service";
import { resultPeriodOptions } from "@/services/leadership-excellence/performance-planning/result-periods";
import type { ProgrammeResult } from "@/services/leadership-excellence/performance-planning/types";
import {
  programmeCommitments,
  programmeLatestResult,
  programmeResultMeetsTarget,
  type ProgrammeCommitment,
} from "@/services/leadership-excellence/performance-planning/programme";
import { usePlanning } from "./PlanningProvider";
import { planningToday } from "./PlanningLinks";
import { Button, control, ErrorList, Field, Modal } from "./PlanningUi";
import { Table } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";

const decisionNames = {
  INVESTIGATE: "Investigate / adjust actions",
  SUSTAIN: "Sustain & standardise",
  REVISE: "Revise company plan",
};
const key = (item: ProgrammeCommitment) =>
  `${item.document.id}/${item.kind}/${item.item.id}/${item.version}`;
const numberOrNull = (value: string) =>
  value.trim() === "" ? null : Number(value);

export function PlanningProgrammeResults({
  cycle,
  onNewFinding,
}: {
  cycle: string;
  onNewFinding: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const today = planningToday(data.references.timeZone);
  const commitments = programmeCommitments(data, cycle, today);
  const documentIds = new Set(
    data.documents
      .filter((plan) => plan.cycle === cycle)
      .map((plan) => plan.id),
  );
  const results = (data.programmeResults || []).filter((row) =>
    documentIds.has(row.documentId),
  );
  const reviews = (data.programmeReviews || []).filter((row) =>
    documentIds.has(row.documentId),
  );
  const progress = (data.programmeActionProgress || []).filter((row) =>
    documentIds.has(row.documentId),
  );
  const actions = (data.programmeActions || []).filter((row) =>
    documentIds.has(row.documentId),
  );
  const [record, setRecord] = useState<string | null>(null);
  const [verify, setVerify] = useState<ProgrammeResult | null>(null);
  const [review, setReview] = useState<ProgrammeCommitment | null>(null);
  const [note, setNote] = useState("");
  const [decision, setDecision] =
    useState<keyof typeof decisionNames>("INVESTIGATE");
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState("");
  const management = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT", "HOD"].includes(
    data.actor.role,
  );
  const name = (id: string) =>
    data.references.people.find(
      (person) => person.userId === id || person.id === id,
    )?.name || (data.actor.userId === id ? data.actor.name : "Authorised user");
  function resultTitle(row: ProgrammeResult) {
    const doc = data.documents.find((plan) => plan.id === row.documentId);
    const version = doc?.versions.find((item) => item.version === row.version);
    const item =
      row.itemKind === "OBJECTIVE"
        ? version?.data.objectives.find((item) => item.id === row.itemId)
        : version?.data.goals.find((item) => item.id === row.itemId);
    return {
      title: item?.title || "Approved commitment",
      unit: item?.unit || "",
    };
  }
  async function verifyResult() {
    if (!verify || busy) return;
    setError("");
    try {
      await run(
        "VERIFY_RESULT",
        { id: verify.id, decision: "VERIFIED", note },
        verify.documentId,
      );
      setVerify(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not verify the measurement.",
      );
    }
  }
  async function saveReview() {
    if (!review || busy) return;
    setError("");
    try {
      await run(
        "SAVE_REVIEW",
        {
          itemId: review.item.id,
          version: review.version,
          decision,
          note,
          nextReviewDate: nextDate,
        },
        review.document.id,
      );
      setReview(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the review.",
      );
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Results & review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Measure each outcome, verify the evidence, then decide what to
            sustain or change.
          </p>
        </div>
        {management && (
          <Button
            disabled={!commitments.length || busy}
            onClick={() => setRecord(commitments[0] ? key(commitments[0]) : "")}
          >
            Record result
          </Button>
        )}
      </div>
      <p className="programme-callout">
        Company achievement comes from its own verified measure. Department and
        individual results show distinct contributions. Completing an action
        does not prove that the target was achieved.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [
            `${actions.filter((row) => progress.find((event) => event.documentId === row.documentId && event.actionId === row.action.id)?.status === "COMPLETED").length} / ${actions.length}`,
            "Delivery actions completed",
          ],
          [
            results.filter((row) => row.status === "VERIFIED").length,
            "Verified measurements",
          ],
          [reviews.length, "Management review decisions"],
        ].map(([value, label]) => (
          <div key={label} className="programme-card">
            <strong className="block text-[26px]">{value}</strong>
            <p className="mt-1 text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <section className="programme-card">
        <h3>Outcomes to measure</h3>
        <div className="mt-4 space-y-4">
          {commitments.map((commitment) => {
            const latest = programmeLatestResult(results, commitment);
            const met = latest
              ? programmeResultMeetsTarget(
                  latest.actual,
                  commitment.item.target,
                  commitment.direction,
                )
              : null;
            const department = data.references.departments.find(
              (item) => item.id === commitment.document.departmentId,
            )?.name;
            const employee = data.references.people.find(
              (item) => item.id === commitment.document.scopeId,
            )?.name;
            return (
              <article key={key(commitment)} className="programme-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {commitment.document.kind === "COMPANY"
                        ? "Company outcome"
                        : commitment.document.kind === "INDIVIDUAL"
                          ? `Individual · ${employee || "Employee"}`
                          : `${department || "Department"} goal`}{" "}
                      · v{commitment.version}
                    </p>
                    <h3 className="mt-1">{commitment.title}</h3>
                  </div>
                  <span
                    className={`programme-badge ${met === true ? "green" : ""}`}
                  >
                    {!latest
                      ? "Awaiting verified result"
                      : met == null
                        ? "Verified · direction not set"
                        : met
                          ? "Period target met"
                          : "Below target"}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    ["Baseline", commitment.item.baseline ?? "Not recorded"],
                    ["Agreed target", commitment.item.target ?? "Not set"],
                    [
                      "Latest verified period",
                      latest?.actual ?? "Not recorded",
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <p>
                        <strong>
                          {value}{" "}
                          {typeof value === "number"
                            ? commitment.item.unit
                            : ""}
                        </strong>
                      </p>
                      {label === "Latest verified period" && latest && (
                        <p className="text-xs text-muted-foreground">
                          {formatDateOnly(latest.periodStart)} –{" "}
                          {formatDateOnly(latest.periodEnd)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {commitment.item.measure} · {commitment.item.definition}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {management && (
                    <Button
                      variant="outline"
                      onClick={() => setRecord(key(commitment))}
                    >
                      Record result
                    </Button>
                  )}
                  {commitment.document.kind === "COMPANY" &&
                    commitment.document.permissions.canApprove && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setReview(commitment);
                          setNote("");
                          setDecision("INVESTIGATE");
                          setNextDate("");
                          setError("");
                        }}
                      >
                        Review progress
                      </Button>
                    )}
                </div>
              </article>
            );
          })}
          {!commitments.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Approve a measurable company objective, department goal or
              individual plan to start recording results.
            </p>
          )}
        </div>
      </section>
      <section className="programme-card">
        <h3>Measurement & verification log</h3>
        {results.length ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <Table className="programme-table">
              <thead>
                <tr>
                  {[
                    "Scope / period",
                    "Measured value",
                    "Evidence",
                    "Verification",
                    "",
                  ].map((title, index) => (
                    <th key={index}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...results]
                  .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
                  .map((row) => {
                    const item = resultTitle(row);
                    const doc = data.documents.find(
                      (plan) => plan.id === row.documentId,
                    );
                    return (
                      <tr key={row.id}>
                        <td className="min-w-48">
                          <strong>{item.title}</strong>
                          <p className="mt-1 text-muted-foreground">
                            {formatDateOnly(row.periodStart)} –{" "}
                            {formatDateOnly(row.periodEnd)} · v{row.version}
                          </p>
                        </td>
                        <td>
                          {row.actual} {item.unit}
                          {row.numerator != null && (
                            <p className="mt-1 text-muted-foreground">
                              {row.numerator} / {row.denominator}
                            </p>
                          )}
                        </td>
                        <td className="min-w-48 whitespace-pre-wrap">
                          {row.source}
                          <p className="mt-2 text-muted-foreground">{row.notes}</p>
                        </td>
                        <td>
                          <span
                            className={`programme-badge ${row.status === "VERIFIED" ? "green" : "amber"}`}
                          >
                            {row.status === "VERIFIED"
                              ? "Verified"
                              : row.status === "REJECTED"
                                ? "Needs correction"
                                : "Pending verification"}
                          </span>
                          <p className="mt-2 text-muted-foreground">
                            Recorded by {name(row.recordedBy)}
                          </p>
                          {row.verifiedBy && (
                            <p className="text-muted-foreground">
                              Verified by {name(row.verifiedBy)} ·{" "}
                              {row.verificationNote}
                            </p>
                          )}
                        </td>
                        <td>
                          {row.status === "PENDING" &&
                            doc?.permissions.canApprove &&
                            row.recordedBy !== data.actor.userId && (
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setVerify(row);
                                  setNote("");
                                  setError("");
                                }}
                              >
                                Verify
                              </Button>
                            )}
                          {row.status === "PENDING" &&
                            row.recordedBy === data.actor.userId && (
                              <span className="text-muted-foreground">
                                A different authorised reviewer must verify.
                              </span>
                            )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No results entered. Missing results remain empty, never zero.
          </p>
        )}
      </section>
      <section className="programme-card">
        <h3>Review & sustain</h3>
        {reviews.length ? (
          <div className="mt-4 space-y-3">
            {reviews.map((row) => (
              <article key={row.id} className="programme-card">
                <div className="flex flex-wrap justify-between gap-3">
                  <strong>
                    {data.documents
                      .find((doc) => doc.id === row.documentId)
                      ?.versions.find(
                        (version) => version.version === row.version,
                      )
                      ?.data.objectives.find((item) => item.id === row.itemId)
                      ?.title || "Company review"}
                  </strong>
                  <span
                    className={`programme-badge ${row.decision === "SUSTAIN" ? "green" : "blue"}`}
                  >
                    {decisionNames[row.decision]}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{row.note}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {name(row.reviewedBy)} · Next review{" "}
                  {row.nextReviewDate
                    ? formatDateOnly(row.nextReviewDate)
                    : "Not set"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            The reviewer considers verified results and action progress
            together. A good result in one period does not prove sustained
            improvement.
          </p>
        )}
        {management && (
          <Button className="mt-5" variant="outline" onClick={onNewFinding}>
            Return to SWOT with new evidence
          </Button>
        )}
      </section>
      {record !== null && (
        <ProgrammeResultEditor
          commitments={commitments}
          initial={record}
          onClose={() => setRecord(null)}
        />
      )}
      {verify && (
        <Modal
          title="Verify the measurement"
          onClose={() => setVerify(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => setVerify(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void verifyResult()}>
                Confirm verified
              </Button>
            </>
          }
        >
          <ErrorList error={error} />
          <p>
            <strong>
              {verify.actual} {resultTitle(verify).unit}
            </strong>{" "}
            · {formatDateOnly(verify.periodStart)} –{" "}
            {formatDateOnly(verify.periodEnd)}
          </p>
          <p className="mt-4 text-sm">
            <strong>Source:</strong> {verify.source}
          </p>
          <p className="my-4 whitespace-pre-wrap text-sm">{verify.notes}</p>
          <Field
            label="Verification note"
            hint="Confirm source, period, scope and calculation; do not infer results from action completion."
          >
            <Textarea
              className={control}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </Modal>
      )}
      {review && (
        <Modal
          title="Review company progress"
          onClose={() => setReview(null)}
          wide
          footer={
            <>
              <Button variant="outline" onClick={() => setReview(null)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void saveReview()}>
                Save review decision
              </Button>
            </>
          }
        >
          <ErrorList error={error} />
          <h3>{review.title}</h3>
          <p className="programme-callout my-4">
            {programmeLatestResult(results, review)
              ? `Latest verified result: ${programmeLatestResult(results, review)!.actual} ${review.item.unit}. Review the evidence and agreed target before selecting the next step.`
              : "No verified company result yet. Investigate the missing evidence; do not conclude that the company target has been achieved."}
          </p>
          <div className="space-y-4">
            <Field label="Management review decision">
              <NativeSelect
                className={control}
                value={decision}
                onChange={(event) =>
                  setDecision(event.target.value as keyof typeof decisionNames)
                }
              >
                {Object.entries(decisionNames).map(([id, label]) => (
                  <option value={id} key={id}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Decision reason & next steps">
              <Textarea
                className={control}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <Field label="Next review date">
              <Input
                type="date"
                className={control}
                value={nextDate}
                onChange={(event) => setNextDate(event.target.value)}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              Sustain a successful method through standard work and follow-up
              checks. A plan revision goes back through its authorised approval
              process.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProgrammeResultEditor({
  commitments,
  initial,
  onClose,
}: {
  commitments: ProgrammeCommitment[];
  initial: string;
  onClose: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const token = useAuthStore((state) => state.accessToken);
  const organizationId = useAuthStore((state) => state.user?.organizationId);
  const [openingRevision] = useState(data.revision);
  const [selected, setSelected] = useState(initial);
  const [periodKey, setPeriodKey] = useState("");
  const [value, setValue] = useState("");
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const commitment = commitments.find((item) => key(item) === selected);
  const schedules = useQuery({
    queryKey: [
      "planning-result-periods",
      organizationId,
      data.actor.userId,
      data.actor.role,
      commitment?.document.id,
      commitment?.item.id,
      data.revision,
    ],
    queryFn: ({ signal }) =>
      PerformancePlanningService.resultPeriods(
        token!,
        commitment!.document.id,
        commitment!.item.id,
        signal,
      ),
    enabled: !!token && !!commitment,
    retry: false,
  });
  const periods = resultPeriodOptions(schedules.data || []);
  const selectedPeriod = periods.find((period) => period.key === periodKey);
  const schedule = schedules.data?.find(
    (item) => item.version === selectedPeriod?.version,
  );
  async function save() {
    if (!commitment || !selectedPeriod?.canRecord || schedules.isFetching) {
      setError(
        "Choose an approved commitment and a completed reporting period.",
      );
      return;
    }
    setError("");
    try {
      await run(
        "SAVE_RESULT",
        {
          itemId: commitment.item.id,
          version: selectedPeriod.version,
          periodStart: selectedPeriod.start,
          periodEnd: selectedPeriod.end,
          actual: numberOrNull(value),
          numerator: schedule?.unit === "%" ? numberOrNull(numerator) : null,
          denominator:
            schedule?.unit === "%" ? numberOrNull(denominator) : null,
          source,
          notes,
        },
        commitment.document.id,
        openingRevision,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the result.",
      );
    }
  }
  return (
    <Modal
      title="Record measured result"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              busy || schedules.isFetching || !selectedPeriod?.canRecord
            }
            onClick={() => void save()}
          >
            Save for verification
          </Button>
        </>
      }
    >
      <ErrorList error={error} />
      <p className="mb-4 text-xs text-muted-foreground">
        Enter a result from the commitment's own source.
      </p>
      <div className="space-y-4">
        <Field label="Approved commitment">
          <NativeSelect
            className={control}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setPeriodKey("");
            }}
          >
            {commitments.map((item) => (
              <option value={key(item)} key={key(item)}>
                {item.document.kind === "COMPANY"
                  ? "Company"
                  : item.document.kind === "INDIVIDUAL"
                    ? "Individual"
                    : "Department"}{" "}
                · {item.title} · v{item.version}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Reporting period"
          hint="Periods come from the approved reporting schedule. The target version is selected automatically for each period."
        >
          <NativeSelect
            className={control}
            value={periodKey}
            disabled={schedules.isFetching || !periods.length}
            onChange={(event) => setPeriodKey(event.target.value)}
          >
            <option value="">
              {schedules.isFetching
                ? "Loading reporting periods…"
                : "Select a reporting period…"}
            </option>
            {periods.map((period) => (
              <option
                key={period.key}
                value={period.key}
                disabled={!period.canRecord}
              >
                {formatDateOnly(period.start)}
                {period.start !== period.end
                  ? ` – ${formatDateOnly(period.end)}`
                  : ""}{" "}
                · v{period.version}
                {!period.canRecord
                  ? period.scheduled === false
                    ? " · Not scheduled"
                    : " · Period not finished"
                  : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {schedules.error && <ErrorList error={schedules.error.message} />}
        {!schedules.isPending && !schedules.error && !periods.length && (
          <p className="text-sm text-warning">
            This commitment has no reporting periods. Set its measurement
            frequency and dates in a revised plan before entering results.
          </p>
        )}
        {selectedPeriod && schedule && (
          <div
            className="rounded-lg border border-border bg-muted p-4 text-sm"
            role="status"
          >
            <strong>
              Approved target: {selectedPeriod.target ?? "Not set"}{" "}
              {selectedPeriod.unit}
            </strong>
            <p className="mt-1">
              Version {schedule.version} · Effective{" "}
              {formatDateOnly(schedule.effectiveDate)} ·{" "}
              {schedule.frequency.replaceAll("_", " ").toLowerCase()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {schedule.calendarSource === "AREA_02"
                ? "Approved reporting calendar"
                : schedule.calendarSource === "WORK_SETTINGS"
                  ? "Work Settings calendar captured at approval"
                  : "Original reporting schedule (no calendar snapshot)"}
              {schedule.calendarVersion ? ` · ${schedule.calendarVersion}` : ""}
            </p>
          </div>
        )}
        <Field
          label="Measured value"
          hint="Use the commitment's unit. Zero is valid; an empty value is not zero."
        >
          <Input
            type="number"
            step="any"
            className={control}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        {schedule?.unit === "%" && (
          <details className="rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-xs font-semibold">
              Calculate a percentage from counts
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Count meeting the measure">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className={control}
                  value={numerator}
                  onChange={(event) => setNumerator(event.target.value)}
                />
              </Field>
              <Field label="Total eligible count">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  className={control}
                  value={denominator}
                  onChange={(event) => setDenominator(event.target.value)}
                />
              </Field>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Use the same population and counting rule as the baseline. Valid
              counts replace the direct value.
            </p>
          </details>
        )}
        <Field label="Source record / location">
          <Input
            className={control}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </Field>
        <Field label="Evidence, scope & checks">
          <Textarea
            className={control}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
