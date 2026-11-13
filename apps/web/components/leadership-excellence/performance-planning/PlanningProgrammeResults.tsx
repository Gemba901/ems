"use client";

import { useState } from "react";
import type { ProgrammeResult } from "@/services/leadership-excellence/performance-planning/types";
import {
  programmeCommitments,
  programmeLatestResult,
  programmeResultMeetsTarget,
  type ProgrammeCommitment,
} from "@/services/leadership-excellence/performance-planning/programme";
import { planningPeriodBounds } from "@/services/leadership-excellence/performance-planning/planning-period";
import { usePlanning } from "./PlanningProvider";
import { planningToday } from "./PlanningLinks";
import { Button, control, ErrorList, Field, Modal } from "./PlanningUi";

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
          <p className="mt-1 text-sm text-slate-500">
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
            <p className="mt-1 text-xs text-slate-500">{label}</p>
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
                    <p className="text-xs text-slate-500">
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
                      <span className="text-xs text-slate-500">{label}</span>
                      <p>
                        <strong>
                          {value}{" "}
                          {typeof value === "number"
                            ? commitment.item.unit
                            : ""}
                        </strong>
                      </p>
                      {label === "Latest verified period" && latest && (
                        <p className="text-xs text-slate-500">
                          {latest.periodStart} – {latest.periodEnd}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
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
            <p className="py-8 text-center text-sm text-slate-500">
              Approve a measurable company objective, department goal or
              individual plan to start recording results.
            </p>
          )}
        </div>
      </section>
      <section className="programme-card">
        <h3>Measurement & verification log</h3>
        {results.length ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="programme-table">
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
                          <p className="mt-1 text-slate-500">
                            {row.periodStart} – {row.periodEnd} · v{row.version}
                          </p>
                        </td>
                        <td>
                          {row.actual} {item.unit}
                          {row.numerator != null && (
                            <p className="mt-1 text-slate-500">
                              {row.numerator} / {row.denominator}
                            </p>
                          )}
                        </td>
                        <td className="min-w-48 whitespace-pre-wrap">
                          {row.source}
                          <p className="mt-2 text-slate-500">{row.notes}</p>
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
                          <p className="mt-2 text-slate-500">
                            Recorded by {name(row.recordedBy)}
                          </p>
                          {row.verifiedBy && (
                            <p className="text-slate-500">
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
                              <span className="text-slate-500">
                                A different authorised reviewer must verify.
                              </span>
                            )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
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
                <p className="mt-3 text-xs text-slate-500">
                  {name(row.reviewedBy)} · Next review {row.nextReviewDate}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
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
          cycle={cycle}
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
            · {verify.periodStart} – {verify.periodEnd}
          </p>
          <p className="mt-4 text-sm">
            <strong>Source:</strong> {verify.source}
          </p>
          <p className="my-4 whitespace-pre-wrap text-sm">{verify.notes}</p>
          <Field
            label="Verification note"
            hint="Confirm source, period, scope and calculation; do not infer results from action completion."
          >
            <textarea
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
              <select
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
              </select>
            </Field>
            <Field label="Decision reason & next steps">
              <textarea
                className={control}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </Field>
            <Field label="Next review date">
              <input
                type="date"
                className={control}
                value={nextDate}
                onChange={(event) => setNextDate(event.target.value)}
              />
            </Field>
            <p className="text-xs text-slate-500">
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
  cycle,
  commitments,
  initial,
  onClose,
}: {
  cycle: string;
  commitments: ProgrammeCommitment[];
  initial: string;
  onClose: () => void;
}) {
  const { run, busy } = usePlanning();
  const [selected, setSelected] = useState(initial);
  const [month, setMonth] = useState("");
  const [value, setValue] = useState("");
  const [numerator, setNumerator] = useState("");
  const [denominator, setDenominator] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const bounds = planningPeriodBounds(cycle);
  async function save() {
    const target = commitments.find((item) => key(item) === selected);
    if (!target || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError("Choose an approved commitment and a measurement month.");
      return;
    }
    const last = new Date(
      Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
    )
      .toISOString()
      .slice(0, 10);
    const first = `${month}-01`;
    if (bounds && (last < bounds.startDate || first > bounds.endDate)) {
      setError(
        "Choose a measurement month within the selected planning period.",
      );
      return;
    }
    setError("");
    try {
      await run(
        "SAVE_RESULT",
        {
          itemId: target.item.id,
          version: target.version,
          periodStart:
            bounds && first < bounds.startDate ? bounds.startDate : first,
          periodEnd: bounds && last > bounds.endDate ? bounds.endDate : last,
          actual: numberOrNull(value),
          numerator: numberOrNull(numerator),
          denominator: numberOrNull(denominator),
          source,
          notes,
        },
        target.document.id,
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
          <Button disabled={busy} onClick={() => void save()}>
            Save for verification
          </Button>
        </>
      }
    >
      <ErrorList error={error} />
      <p className="mb-4 text-xs text-slate-500">
        Enter a result from the commitment's own source.
      </p>
      <div className="space-y-4">
        <Field label="Approved commitment">
          <select
            className={control}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
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
          </select>
        </Field>
        <Field label="Measurement period">
          <input
            type="month"
            min={bounds?.startDate.slice(0, 7)}
            max={bounds?.endDate.slice(0, 7)}
            className={control}
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </Field>
        <Field
          label="Measured value"
          hint="Use the commitment's unit. Zero is valid; an empty value is not zero."
        >
          <input
            type="number"
            step="any"
            className={control}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <details className="rounded-lg border border-slate-200 p-4">
          <summary className="cursor-pointer text-xs font-semibold">
            Calculate a percentage from counts
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Count meeting the measure">
              <input
                type="number"
                min={0}
                step={1}
                className={control}
                value={numerator}
                onChange={(event) => setNumerator(event.target.value)}
              />
            </Field>
            <Field label="Total eligible count">
              <input
                type="number"
                min={1}
                step={1}
                className={control}
                value={denominator}
                onChange={(event) => setDenominator(event.target.value)}
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Use the same population and counting rule as the baseline. Valid
            counts replace the direct value.
          </p>
        </details>
        <Field label="Source record / location">
          <input
            className={control}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </Field>
        <Field label="Evidence, scope & checks">
          <textarea
            className={control}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
