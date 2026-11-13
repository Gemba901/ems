"use client";

import { useState } from "react";
import type {
  Goal,
  SourceLink,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning/types";
import { planningPeriodBounds } from "@/services/leadership-excellence/performance-planning/planning-period";
import {
  findingActionRows,
  visibleProgrammeActionRows,
  type ProgrammeActionRow,
} from "@/services/leadership-excellence/performance-planning/programme-action-links";
import { usePlanning } from "./PlanningProvider";
import { reviewedSwotSources } from "./PlanningSources";
import { Button, control, ErrorList, Field, Modal } from "./PlanningUi";

type Plan = PlanningView["documents"][number];
export type ProgrammeActionSeed = {
  document?: Plan;
  goal?: Goal;
  sources?: SourceLink[];
};
export type { ProgrammeActionRow } from "@/services/leadership-excellence/performance-planning/programme-action-links";

/** Reviewed findings that were assigned directly to a department retain their own actions. */
export function PlanningProgrammeActions({
  cycle,
  onAdd,
}: {
  cycle: string;
  onAdd: (seed: ProgrammeActionSeed) => void;
}) {
  const { data, busy } = usePlanning();
  const sources = reviewedSwotSources(data.documents, cycle);
  const latestSources = [
    ...new Map(
      sources
        .sort((a, b) => a.version - b.version)
        .map((source) => [`${source.documentId}/${source.findingId}`, source]),
    ).values(),
  ];
  const periodDocuments = new Set(
    data.documents
      .filter((plan) => plan.cycle === cycle)
      .map((plan) => plan.id),
  );
  const directRows = visibleProgrammeActionRows(data).filter(
    (row) =>
      periodDocuments.has(row.documentId) &&
      !row.action.goalId &&
      !row.action.parent,
  );
  const sourceIdentity = (source: SourceLink) =>
    `${source.documentId}/${source.findingId}`;
  const actionSources = new Map(
    directRows.flatMap((row) =>
      row.action.sources.map(
        (source) => [sourceIdentity(source), source] as const,
      ),
    ),
  );
  const groups = new Map<
    string,
    { source: SourceLink; finding?: (typeof latestSources)[number]["finding"] }
  >();
  for (const source of latestSources) {
    if (
      source.finding.response === "ACTION" ||
      actionSources.has(sourceIdentity(source))
    )
      groups.set(sourceIdentity(source), { source, finding: source.finding });
  }
  // Keep authorised action records visible even if their source is no longer
  // available to this viewer. Never fetch or expand a confidential finding here.
  for (const [key, source] of actionSources) {
    if (!groups.has(key)) groups.set(key, { source });
  }
  const canEdit = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT", "HOD"].includes(
    data.actor.role,
  );
  if (!groups.size) return null;
  return (
    <section className="programme-card">
      <div className="flex flex-wrap justify-between gap-3">
        <h3>Direct responses from SWOT</h3>
        <span className="programme-badge">Company objective optional</span>
      </div>
      <div className="mt-4 space-y-4">
        {[...groups.values()].map(({ source, finding }) => (
          <section
            key={`${source.documentId}/${source.findingId}`}
            data-swot-action-finding={`${source.documentId}/${source.findingId}`}
            data-swot-action-finding-id={source.findingId}
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-500">
                  {finding?.code || "Reviewed SWOT source"}
                </span>
                <h4 className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold">
                  {finding?.title ||
                    "Source details are not available in this view."}
                </h4>
              </div>
              {canEdit && finding?.response === "ACTION" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    onAdd({
                      sources: [
                        {
                          documentId: source.documentId,
                          findingId: source.findingId,
                          version: source.version,
                        },
                      ],
                    })
                  }
                >
                  Assign department action
                </Button>
              )}
            </div>
            <div className="mt-4">
              <ProgrammeActionList
                rows={findingActionRows(data, source).filter((row) =>
                  periodDocuments.has(row.documentId),
                )}
                emptyMessage="No department actions assigned to this finding yet."
              />
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

/** The same action stays attached to its goal or reviewed finding. */
export function ProgrammeActionList({
  rows,
  emptyMessage = "No actions added yet.",
}: {
  rows: ProgrammeActionRow[];
  emptyMessage?: string;
}) {
  const { data, run, busy } = usePlanning();
  const [selected, setSelected] = useState<
    (ProgrammeActionRow & { complete?: boolean }) | null
  >(null);
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const canEdit = ["ADMIN", "SUPER_ADMIN", "MANAGEMENT", "HOD"].includes(
    data.actor.role,
  );
  const person = (id: string) =>
    data.references.people.find((person) => person.id === id)?.name ||
    "Not assigned";
  async function update(
    row: ProgrammeActionRow,
    status: "IN_PROGRESS" | "COMPLETED",
  ) {
    if (row.readOnly || busy) return;
    setError("");
    try {
      await run(
        "UPDATE_ACTION_PROGRESS",
        {
          actionId: row.action.id,
          status,
          evidence: status === "COMPLETED" ? evidence : "",
        },
        row.documentId,
      );
      setSelected(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update the action.",
      );
    }
  }
  return (
    <>
      <details data-programme-action-list>
        <summary className="cursor-pointer rounded-md py-1 text-sm font-semibold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
          Actions ({rows.length})
        </summary>
        <ErrorList error={!selected ? error : ""} />
        <div className="mt-3 space-y-3">
          {rows.map((row) => {
            const state = data.programmeActionProgress?.find(
              (item) =>
                item.documentId === row.documentId &&
                item.actionId === row.action.id,
            );
            const status = state?.status || "PLANNED";
            const plan = data.documents.find(
              (item) => item.id === row.documentId,
            );
            const department = data.references.departments.find(
              (item) => item.id === plan?.departmentId,
            )?.name;
            return (
              <article
                key={`${row.documentId}/${row.action.id}/${row.version ?? "current"}`}
                data-programme-action={`${row.documentId}/${row.action.id}`}
                data-programme-action-id={row.action.id}
                data-action-id={row.action.id}
                className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-500">
                      {row.action.code} ·{" "}
                      {row.action.goalId || row.action.parent
                        ? "Goal action"
                        : "Direct SWOT response"}
                      {row.version ? ` · v${row.version}` : ""}
                    </p>
                    <h3 className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold">
                      {row.action.title}
                    </h3>
                  </div>
                  <span
                    className={`programme-badge ${status === "COMPLETED" ? "green" : status === "IN_PROGRESS" ? "blue" : ""}`}
                  >
                    {status === "COMPLETED"
                      ? "Completed"
                      : status === "IN_PROGRESS"
                        ? "In progress"
                        : "Planned"}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-500">
                  {department || "Department"} · {person(row.action.ownerId)} ·
                  Due {row.action.dueDate || "Not set"}
                </p>
                <p className="mt-3 text-xs text-slate-500">
                  {row.action.expectedResult}
                </p>
                {state?.evidence && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-xs">
                    <strong>Completion evidence:</strong> {state.evidence}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelected(row);
                      setError("");
                    }}
                  >
                    View details
                  </Button>
                  {canEdit && !row.readOnly && status === "PLANNED" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void update(row, "IN_PROGRESS")}
                    >
                      Start action
                    </Button>
                  )}
                  {canEdit && !row.readOnly && status === "IN_PROGRESS" && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setSelected({ ...row, complete: true });
                        setEvidence("");
                        setError("");
                      }}
                    >
                      Record completion
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
          {!rows.length && (
            <p className="py-1 text-xs text-slate-500">{emptyMessage}</p>
          )}
        </div>
      </details>
      {selected && (
        <Modal
          title={
            selected.complete ? "Record action completion" : "Delivery action"
          }
          onClose={() => setSelected(null)}
          footer={
            <>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Close
              </Button>
              {selected.complete && !selected.readOnly && (
                <Button
                  disabled={busy}
                  onClick={() => void update(selected, "COMPLETED")}
                >
                  Save completion
                </Button>
              )}
            </>
          }
        >
          <ErrorList error={error} />
          <h3>{selected.action.title}</h3>
          <dl className="my-5 grid gap-4 sm:grid-cols-2">
            {[
              ["Owner", person(selected.action.ownerId)],
              ["Due date", selected.action.dueDate],
              ["Expected result", selected.action.expectedResult],
              [
                "Completion evidence required",
                selected.action.completionEvidence,
              ],
              ["Resources / support", selected.action.support],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">
                  {value || "Not set"}
                </dd>
              </div>
            ))}
          </dl>
          {selected.complete && (
            <Field label="Completion evidence">
              <textarea
                className={control}
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
              />
            </Field>
          )}
        </Modal>
      )}
    </>
  );
}

export function ProgrammeActionEditor({
  cycle,
  seed,
  onClose,
}: {
  cycle: string;
  seed: ProgrammeActionSeed;
  onClose: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const [department, setDepartment] = useState(seed.document?.scopeId || "");
  const [documentId, setDocumentId] = useState(seed.document?.id || "");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(data.actor.employeeId);
  const [due, setDue] = useState("");
  const [expected, setExpected] = useState("");
  const [proof, setProof] = useState("");
  const [support, setSupport] = useState("");
  const [error, setError] = useState("");
  const bounds = planningPeriodBounds(cycle);
  const [revision, setRevision] = useState(data.revision);
  async function save() {
    if (!department) {
      setError("Choose the responsible department.");
      return;
    }
    setError("");
    try {
      const existing = data.documents.find(
        (plan) =>
          plan.kind === "DEPARTMENT" &&
          plan.scopeId === department &&
          plan.cycle === cycle,
      );
      let id = documentId || existing?.id;
      let expectedRevision = revision;
      if (!id) {
        id = await run(
          "CREATE_PLAN",
          {
            kind: "DEPARTMENT",
            scopeId: department,
            cycle,
          },
          undefined,
          expectedRevision,
        );
        setDocumentId(id);
        expectedRevision += 1;
        setRevision(expectedRevision);
      }
      await run(
        "SAVE_ITEM",
        {
          kind: "action",
          data: {
            title,
            goalId: seed.goal?.id || "",
            ownerId: owner,
            dueDate: due,
            expectedResult: expected,
            completionEvidence: proof,
            support,
            sources: seed.sources || [],
          },
        },
        id,
        expectedRevision,
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save the action.",
      );
    }
  }
  return (
    <Modal
      title="Assign department action"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void save()}>
            Save action
          </Button>
        </>
      }
    >
      <ErrorList error={error} />
      <p className="programme-callout mb-5">
        {seed.goal
          ? `Linked to ${seed.goal.code} · ${seed.goal.title}`
          : "A direct response to a reviewed SWOT finding. No new company objective is required."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Action / deliverable">
            <textarea
              className={control}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Department">
          <select
            className={control}
            disabled={!!seed.document || !!documentId}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          >
            <option value="">Choose a department</option>
            {data.references.departments.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Accountable owner">
          <select
            className={control}
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="">Choose an owner</option>
            {data.references.people.map((person) => (
              <option value={person.id} key={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input
            type="date"
            className={control}
            min={bounds?.startDate}
            max={seed.goal?.endDate || bounds?.endDate}
            value={due}
            onChange={(event) => setDue(event.target.value)}
          />
        </Field>
        <Field label="Resources / support">
          <input
            className={control}
            value={support}
            onChange={(event) => setSupport(event.target.value)}
          />
        </Field>
        <Field label="Expected result">
          <textarea
            className={control}
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
          />
        </Field>
        <Field label="Completion evidence required">
          <textarea
            className={control}
            value={proof}
            onChange={(event) => setProof(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
