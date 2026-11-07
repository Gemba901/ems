"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type {
  AuditEvent,
  PlanningView,
  SourceLink,
} from "@/services/leadership-excellence/performance-planning.service";
import { validFindingWeightage } from "@/services/leadership-excellence/performance-planning/finding-weightage";
import { FindingWeightage } from "./FindingWeightage";
import { usePlanning } from "./PlanningProvider";
import { PlanningEvidence } from "./PlanningEvidence";
import { categories, control, ErrorList, Field, Modal } from "./PlanningUi";

type Plan = PlanningView["documents"][number];

export function planningToday(timeZone?: string) {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    return ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type)!.value)
      .join("-");
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function planningTime(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timeZone || "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

export function ReviewedSources({ sources }: { sources: SourceLink[] }) {
  const { data } = usePlanning();
  return (
    <ul className="mt-3 space-y-3">
      {sources.map((source) => {
        const assessment = data.documents.find(
          (item) => item.id === source.documentId,
        );
        const reviewed = assessment?.versions.find(
          (item) => item.version === source.version,
        );
        const finding = reviewed?.data.findings.find(
          (item) => item.id === source.findingId,
        );
        return (
          <li
            key={`${source.documentId}/${source.version}/${source.findingId}`}
            className="rounded-lg border border-border bg-background p-3"
          >
            {!finding || !assessment ? (
              <p className="text-sm text-muted-foreground">
                This reviewed source is restricted or unavailable.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {finding.code} · {finding.pillar} ·{" "}
                  {categories[finding.category].singular} · reviewed version{" "}
                  {source.version}
                </p>
                <p className="mt-1 font-medium">{finding.title}</p>
                <div className="mt-2">
                  <FindingWeightage weightage={finding.weightage} />
                </div>
                {!validFindingWeightage(finding.weightage) &&
                  finding.priority && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Previous priority (before weightage): {finding.priority}
                    </p>
                  )}
                <dl className="mt-3 space-y-2 text-sm">
                  {[
                    ["Explanation", finding.explanation],
                    ["Business impact", finding.impact],
                    ["Evidence / reference", finding.evidence],
                    ["Decision", finding.decisionNote],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="whitespace-pre-wrap break-words">
                          {value}
                        </dd>
                      </div>
                    ))}
                  {finding.sourceUrl && (
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        Supporting link
                      </dt>
                      <dd>
                        {/^https?:\/\//i.test(finding.sourceUrl) ? (
                          <a
                            className="break-all underline"
                            href={finding.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {finding.sourceUrl}
                          </a>
                        ) : (
                          <span className="break-all">{finding.sourceUrl}</span>
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium">
                    Supporting files
                  </summary>
                  <div className="mt-2">
                    <PlanningEvidence
                      document={assessment}
                      findingId={finding.id}
                      editable={false}
                    />
                  </div>
                </details>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FindingConnections({
  documentId,
  findingId,
  onOpen,
}: {
  documentId: string;
  findingId: string;
  onOpen: (
    document: Plan,
    kind: "objective" | "action",
    item: Record<string, unknown>,
  ) => void;
}) {
  const { data } = usePlanning();
  const connections = data.documents
    .flatMap((document) => [
      ...document.data.objectives.map((item) => ({
        document,
        kind: "objective" as const,
        item,
      })),
      ...document.data.actions.map((item) => ({
        document,
        kind: "action" as const,
        item,
      })),
    ])
    .filter(({ item }) =>
      item.sources.some(
        (source) =>
          source.documentId === documentId && source.findingId === findingId,
      ),
    );
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {connections.length ? (
        connections.map(({ document, kind, item }) => (
          <button
            key={`${document.id}/${kind}/${item.id}`}
            className="rounded border border-border bg-muted px-2 py-1 text-left text-xs hover:bg-muted/60"
            onClick={() => onOpen(document, kind, { ...item })}
          >
            {kind === "objective" ? "Objective" : "Action"}: {item.code} ·{" "}
            {item.title || "Untitled"}
          </button>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">
          No linked objectives or actions visible.
        </span>
      )}
    </div>
  );
}

export function LinkFindingAction({
  cycle,
  sources,
  onClose,
}: {
  cycle: string;
  sources: SourceLink[];
  onClose: () => void;
}) {
  const { data, run, busy } = usePlanning();
  const [revision] = useState(data.revision);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const choices = data.documents
    .filter(
      (document) =>
        document.cycle === cycle &&
        document.permissions.canEdit &&
        document.kind !== "SWOT",
    )
    .flatMap((document) =>
      document.data.actions.map((action) => ({ document, action })),
    );
  return (
    <Modal title="Link findings to an existing action" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const choice = choices.find(
            ({ document, action }) =>
              `${document.id}/${action.id}` === selected,
          );
          if (!choice) return;
          const links = [...choice.action.sources];
          for (const source of sources)
            if (
              !links.some(
                (link) =>
                  link.documentId === source.documentId &&
                  link.findingId === source.findingId &&
                  link.version === source.version,
              )
            )
              links.push(source);
          try {
            await run(
              "SAVE_ITEM",
              {
                kind: "action",
                id: choice.action.id,
                data: { ...choice.action, sources: links },
              },
              choice.document.id,
              revision,
            );
            onClose();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : "Could not link the action.",
            );
          }
        }}
      >
        <ErrorList error={error} />
        <p className="text-sm text-muted-foreground">
          {sources.length} reviewed finding(s) will be referenced by the
          existing action. Approved actions must be opened in a plan revision
          before their planning links can change.
        </p>
        <Field label="Existing delivery action">
          <select
            className={control}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Select an action…</option>
            {choices.map(({ document, action }) => (
              <option key={action.id} value={`${document.id}/${action.id}`}>
                {document.data.title || document.code} · {action.code} ·{" "}
                {action.title}
              </option>
            ))}
          </select>
        </Field>
        {!choices.length && (
          <p className="text-sm text-muted-foreground">
            No editable actions in this planning year. Add the delivery action
            in its department plan, or open a revision of that plan, then return
            here.
          </p>
        )}
        <Button disabled={busy || !selected} type="submit">
          Link existing action
        </Button>
      </form>
    </Modal>
  );
}

export function SharedActions({
  document,
  fixedGoalId,
  unlinkedOnly = false,
}: {
  document: Plan;
  fixedGoalId?: string;
  unlinkedOnly?: boolean;
}) {
  const { data, run, busy } = usePlanning();
  const [open, setOpen] = useState(false);
  const [goalId, setGoalId] = useState(fixedGoalId || "");
  const [selected, setSelected] = useState("");
  const [revision, setRevision] = useState(data.revision);
  const [error, setError] = useState("");
  const links = document.data.actionLinks || [];
  const visibleLinks = fixedGoalId
    ? links.filter((link) => link.goalId === fixedGoalId)
    : unlinkedOnly
      ? links.filter(
          (link) =>
            !document.data.goals.some((goal) => goal.id === link.goalId),
        )
      : links;
  const selectedGoal = document.data.goals.find((goal) => goal.id === goalId);
  const parent = selectedGoal?.parent;
  const candidates = (data.sharedActions || []).filter(
    (source) =>
      source.documentId === parent?.documentId &&
      source.version === parent?.version &&
      source.action.goalId === parent?.goalId &&
      (document.kind === "INDIVIDUAL"
        ? source.action.ownerId === document.scopeId
        : document.data.contributorIds.includes(source.action.ownerId)) &&
      (!selectedGoal?.startDate ||
        source.action.dueDate >= selectedGoal.startDate) &&
      (!selectedGoal?.endDate ||
        source.action.dueDate <= selectedGoal.endDate) &&
      !links.some(
        (link) =>
          link.documentId === source.documentId &&
          link.actionId === source.action.id,
      ),
  );
  const key = (value: (typeof candidates)[number]) =>
    `${value.documentId}/${value.version}/${value.action.id}`;
  const eligiblePlan = ["TEAM", "POSITION", "INDIVIDUAL"].includes(
    document.kind,
  );
  if ((!eligiblePlan || unlinkedOnly) && !visibleLinks.length) return null;
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Assigned department actions</h3>
        {document.permissions.canEdit &&
          !unlinkedOnly &&
          eligiblePlan &&
          (!fixedGoalId || selectedGoal?.parent) && (
            <Button
              variant="outline"
              onClick={() => {
                setRevision(data.revision);
                setError("");
                setOpen(true);
              }}
            >
              Use existing department action
            </Button>
          )}
      </div>
      <ErrorList error={open ? "" : error} />
      {!visibleLinks.length && (
        <p className="text-sm text-muted-foreground">
          Reuse a department action or assigned step against your contribution.
          Its code, owner, deadline and evidence remain on the original record.
        </p>
      )}
      {visibleLinks.map((link) => {
        const source = (data.sharedActions || []).find(
          (entry) =>
            entry.documentId === link.documentId &&
            entry.version === link.version &&
            entry.action.id === link.actionId,
        );
        const action =
          source?.action ||
          data.documents
            .find((entry) => entry.id === link.documentId)
            ?.versions.find((entry) => entry.version === link.version)
            ?.data.actions.find((entry) => entry.id === link.actionId);
        return (
          <div
            key={link.id}
            className="rounded-lg border border-border p-4 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  {action?.code || "Department action"} · approved version{" "}
                  {link.version}
                </p>
                <p className="mt-1 font-medium">
                  {action?.title || "Linked action is unavailable"}
                </p>
              </div>
              {document.permissions.canEdit && (
                <Button
                  disabled={busy}
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await run("UNLINK_ACTION", { id: link.id }, document.id);
                    } catch (cause) {
                      setError(
                        cause instanceof Error
                          ? cause.message
                          : "Could not remove the link.",
                      );
                    }
                  }}
                >
                  Remove link
                </Button>
              )}
            </div>
            {action && (
              <>
                <p className="mt-2 text-xs text-muted-foreground">
                  Owner:{" "}
                  {data.references.people.find(
                    (person) => person.id === action.ownerId,
                  )?.name || "Unavailable"}{" "}
                  · Due {action.dueDate || "not set"}
                </p>
                <p className="mt-2">{action.expectedResult}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Completion evidence: {action.completionEvidence || "Not set"}
                </p>
                {action.support && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Support: {action.support}
                  </p>
                )}
              </>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Contribution:{" "}
              {document.data.goals.find((goal) => goal.id === link.goalId)
                ?.title || "Unavailable"}
            </p>
          </div>
        );
      })}
      {open && (
        <Modal
          title="Use an existing department action"
          onClose={() => setOpen(false)}
        >
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const choice = candidates.find(
                (entry) => key(entry) === selected,
              );
              if (!choice) return;
              try {
                await run(
                  "LINK_ACTION",
                  {
                    goalId,
                    documentId: choice.documentId,
                    actionId: choice.action.id,
                    version: choice.version,
                  },
                  document.id,
                  revision,
                );
                setOpen(false);
                setSelected("");
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not link the action.",
                );
              }
            }}
          >
            <ErrorList error={error} />
            <Field label="Your contribution goal">
              <select
                className={control}
                value={goalId}
                disabled={!!fixedGoalId}
                onChange={(event) => {
                  setGoalId(event.target.value);
                  setSelected("");
                }}
              >
                <option value="">Select a goal…</option>
                {document.data.goals
                  .filter((goal) => goal.parent)
                  .map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.code} · {goal.title}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Department action / assigned step">
              <select
                className={control}
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Select an approved action…</option>
                {candidates.map((entry) => (
                  <option key={key(entry)} value={key(entry)}>
                    {entry.action.code} · {entry.action.title} · Due{" "}
                    {entry.action.dueDate}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-muted-foreground">
              Actions come from the same approved department goal and version as
              your contribution. The action owner and deadline must fit this
              plan. No duplicate action is created.
            </p>
            {goalId && !candidates.length && (
              <p className="text-sm text-muted-foreground">
                No unlinked actions are available for this goal&apos;s approved
                department version.
              </p>
            )}
            {!document.data.goals.some((goal) => goal.parent) && (
              <p className="text-sm text-muted-foreground">
                First create a contribution linked to an approved department
                goal.
              </p>
            )}
            <Button type="submit" disabled={busy || !selected}>
              Assign existing action
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function AuditChanges({ event }: { event: AuditEvent }) {
  const { data } = usePlanning();
  const show = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "Not set";
    if (typeof value === "string")
      return (
        data.references.people.find((person) => person.id === value)?.name ||
        data.references.departments.find(
          (department) => department.id === value,
        )?.name ||
        value
      );
    if (Array.isArray(value)) return value.map(show).join(", ") || "None";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };
  if (!event.changes?.length) return null;
  return (
    <details className="mt-2 rounded border border-border p-2">
      <summary className="cursor-pointer">
        View {event.changes.length} change(s)
      </summary>
      <dl className="mt-2 space-y-3">
        {event.changes.map((change, index) => (
          <div key={`${change.field}/${index}`}>
            <dt className="font-medium">
              {change.field.replace(/([a-z])([A-Z])/g, "$1 $2")}
            </dt>
            <dd className="mt-1 grid gap-2 sm:grid-cols-2">
              <div className="min-w-0 rounded bg-muted p-2">
                <span className="block text-muted-foreground">Before</span>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans">
                  {show(change.before)}
                </pre>
              </div>
              <div className="min-w-0 rounded bg-muted p-2">
                <span className="block text-muted-foreground">After</span>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-sans">
                  {show(change.after)}
                </pre>
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
