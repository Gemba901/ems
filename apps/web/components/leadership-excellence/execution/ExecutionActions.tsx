"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LifeBuoy } from "lucide-react";
import type { ExecutionAction } from "@/services/leadership-excellence/execution.service";
import { useExecution } from "./ExecutionProvider";
import { useExecutionScope } from "./ExecutionFrame";
import {
  ExecutionStatus,
  HistoryList,
  ReloadExecutionEntries,
} from "./ExecutionUi";
import {
  Button,
  card,
  control,
  Empty,
  ErrorList,
  Field,
  Modal,
} from "../performance-planning/PlanningUi";

const BASE = "/leadership-excellence/execution";
export function ExecutionActions() {
  const { data } = useExecution();
  const { actions, scope, cycle } = useExecutionScope();
  const router = useRouter();
  const params = useSearchParams();
  const selectedKey = params.get("action");
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const selected = actions.find((a) => a.key === selectedKey);
  const status = (key: string) =>
    data.actionUpdates.find((u) => u.actionKey === key)?.status ||
    "NOT_STARTED";
  const visible = actions.filter(
    (a) =>
      (filter === "ALL" || status(a.key) === filter) &&
      `${a.action.title} ${a.goalTitle}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const href = (key?: string) =>
    `${BASE}/delivery-actions?scope=${scope}&cycle=${encodeURIComponent(cycle)}${key ? `&action=${encodeURIComponent(key)}` : ""}`;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">
          {scope === "department" ? "Department actions" : "My actions"}{" "}
          <span className="text-slate-500">({actions.length})</span>
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Update the shared actions assigned in Performance Planning.
        </p>
      </div>
      {selectedKey && !selected && (
        <ErrorList error="This action is not available in this scope or planning period. Choose the matching period above." />
      )}
      {actions.length ? (
        <>
          <div className="flex flex-wrap gap-3">
            <input
              aria-label="Search actions"
              className={`${control} mt-0 max-w-sm`}
              placeholder="Search action or goal…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter action status"
              className={`${control} mt-0 sm:w-56`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {[
                ["ALL", "All actions"],
                ["NOT_STARTED", "Ready to start"],
                ["IN_PROGRESS", "In progress"],
                ["BLOCKED", "Needs help"],
                ["PENDING_CHECK", "Waiting for check"],
                ["COMPLETED", "Completed"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {visible.map((entry) => {
            const update = data.actionUpdates.find(
              (u) => u.actionKey === entry.key,
            );
            const overdue =
              entry.action.dueDate < data.today &&
              update?.status !== "COMPLETED";
            return (
              <article key={entry.key} className={card}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <button
                      className="text-left text-lg font-semibold hover:text-indigo-700 hover:underline"
                      onClick={() => router.push(href(entry.key))}
                    >
                      {entry.action.title}{" "}
                      <ArrowRight size={16} className="inline" />
                    </button>
                    <p className="mt-1 text-sm text-slate-500">
                      {entry.goalTitle}
                    </p>
                    <p className="mt-3 text-xs text-slate-500">
                      Owner:{" "}
                      {data.references.people.find(
                        (p) => p.id === entry.action.ownerId,
                      )?.name || "Not assigned"}{" "}
                      · Due {entry.action.dueDate}
                      {overdue ? " · Overdue" : ""}
                    </p>
                  </div>
                  <div className="space-y-2 text-right">
                    <ExecutionStatus status={update?.status || "NOT_STARTED"} />
                    <p className="text-sm font-medium">
                      {update?.progress || 0}%
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${update?.progress || 0}%` }}
                  />
                </div>
              </article>
            );
          })}
          {!visible.length && (
            <p className={card}>No actions match your filters.</p>
          )}
        </>
      ) : (
        <Empty title="No actions assigned yet">
          An approved goal’s existing delivery actions will appear here. An
          individual plan does not need another copy of the same action.
        </Empty>
      )}
      {selected && (
        <ActionDialog
          key={selected.key}
          entry={selected}
          onClose={() => router.push(href())}
        />
      )}
    </div>
  );
}

function ActionDialog({
  entry,
  onClose,
}: {
  entry: ExecutionAction;
  onClose: () => void;
}) {
  const { data, run, busy } = useExecution();
  const { scope, cycle } = useExecutionScope();
  const update = data.actionUpdates.find((u) => u.actionKey === entry.key);
  const [status, setStatus] = useState(
    update?.status === "BLOCKED"
      ? "BLOCKED"
      : update?.status === "PENDING_CHECK"
        ? "PENDING_CHECK"
        : "IN_PROGRESS",
  );
  const [progress, setProgress] = useState(String(update?.progress || 0));
  const [note, setNote] = useState(update?.note || "");
  const [evidence, setEvidence] = useState(update?.evidence || "");
  const [delay, setDelay] = useState(update?.delayReason || "");
  const [checkNote, setCheckNote] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(data.revision);
  const editable =
    entry.canUpdate &&
    !["COMPLETED", "PENDING_CHECK"].includes(update?.status || "");
  async function save(decision?: "COMPLETE" | "RETURN") {
    setError("");
    try {
      if (decision)
        await run(
          "CHECK_ACTION",
          { actionKey: entry.key, decision, note: checkNote },
          revision,
        );
      else
        await run(
          "UPDATE_ACTION",
          {
            actionKey: entry.key,
            status,
            progress: status === "PENDING_CHECK" ? 100 : Number(progress),
            note,
            evidence,
            delayReason: delay,
          },
          revision,
        );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save. Your entries are still here.",
      );
    }
  }
  const supportGoal = data.goals.find((g) => g.key === entry.goalKey);
  return (
    <Modal
      title="Action details"
      description="Action progress is separate from KPI results."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            {supportGoal?.canRequestSupport && (
              <Link
                href={`${BASE}/support-requests?scope=${scope}&cycle=${encodeURIComponent(cycle)}&goal=${encodeURIComponent(entry.goalKey)}&action=${encodeURIComponent(entry.key)}`}
                className="inline-flex items-center gap-1 py-2 text-sm text-indigo-700"
              >
                <LifeBuoy size={15} />
                Ask for support
              </Link>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Close
            </Button>
            {editable && (
              <Button disabled={busy} onClick={() => void save()}>
                {status === "PENDING_CHECK"
                  ? "Send for completion check"
                  : "Save progress"}
              </Button>
            )}
            {entry.canCheck && update?.status === "PENDING_CHECK" && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save("RETURN")}
                >
                  Return for changes
                </Button>
                <Button disabled={busy} onClick={() => void save("COMPLETE")}>
                  Confirm completion
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <ErrorList error={error} />
        {error && <ReloadExecutionEntries onReload={setRevision} />}
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">{entry.action.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{entry.goalTitle}</p>
          <p className="mt-2 text-xs text-slate-500">
            Owner:{" "}
            {data.references.people.find((p) => p.id === entry.action.ownerId)
              ?.name || "Not assigned"}{" "}
            · Due {entry.action.dueDate} · Approved plan v{entry.version}
          </p>
          <p className="mt-3 text-sm">
            <strong>Expected result:</strong>{" "}
            {entry.action.expectedResult || "Not specified"}
          </p>
          <p className="mt-1 text-sm">
            <strong>Completion evidence:</strong>{" "}
            {entry.action.completionEvidence ||
              "Provide evidence of the completed work."}
          </p>
        </section>
        <div className="flex items-center gap-4">
          <ExecutionStatus status={update?.status || "NOT_STARTED"} />
          <span className="text-sm font-medium">
            {update?.progress || 0}% complete
          </span>
        </div>
        {editable ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What is happening?">
                <select
                  className={control}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="IN_PROGRESS">Work in progress</option>
                  <option value="BLOCKED">Blocked / need help</option>
                  <option value="PENDING_CHECK">
                    Finished — ready for check
                  </option>
                </select>
              </Field>
              <Field label="Progress (%)">
                <input
                  className={control}
                  type="number"
                  min={0}
                  max={100}
                  value={status === "PENDING_CHECK" ? "100" : progress}
                  disabled={status === "PENDING_CHECK"}
                  onChange={(e) => setProgress(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Progress update">
              <textarea
                className={control}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What has been done, and what is next?"
              />
            </Field>
            <Field label="Evidence reference or link">
              <input
                className={control}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Report, checklist, photo reference or document link"
              />
            </Field>
            <Field
              label={
                status === "BLOCKED"
                  ? "What is blocking the work?"
                  : "Reason for delay (if applicable)"
              }
            >
              <textarea
                className={control}
                rows={2}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
              />
            </Field>
          </>
        ) : (
          <div className="space-y-2 text-sm">
            <p>
              <strong>Update:</strong> {update?.note || "No update yet."}
            </p>
            <p>
              <strong>Evidence:</strong> {update?.evidence || "Not provided."}
            </p>
            {update?.delayReason && (
              <p>
                <strong>Delay:</strong> {update.delayReason}
              </p>
            )}
            {entry.canCheck && update?.status === "PENDING_CHECK" && (
              <Field label="Completion check notes">
                <textarea
                  className={control}
                  rows={3}
                  value={checkNote}
                  onChange={(e) => setCheckNote(e.target.value)}
                  placeholder="Confirm the evidence or explain what needs to change."
                />
              </Field>
            )}
          </div>
        )}
        <details className="border-t border-slate-200 pt-4">
          <summary className="cursor-pointer text-sm text-slate-600">
            Activity history ({update?.history.length || 0})
          </summary>
          <div className="mt-4">
            <HistoryList history={update?.history || []} />
          </div>
        </details>
      </div>
    </Modal>
  );
}
