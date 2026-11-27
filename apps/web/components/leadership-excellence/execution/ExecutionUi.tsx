"use client";

import { useState } from "react";
import type { ExecutionHistory } from "@/services/leadership-excellence/execution.service";
import { Button, Modal } from "../performance-planning/PlanningUi";
import { useExecution } from "./ExecutionProvider";

export function ReloadExecutionEntries({
  onReload,
}: {
  onReload: (revision: number) => void;
}) {
  const { refresh } = useExecution();
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          const latest = await refresh();
          if (latest) {
            onReload(latest.revision);
            setNotice(
              "Current records reloaded. Your entries remain; review them before saving again.",
            );
          }
        }}
      >
        Reload current records and keep my entries
      </Button>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}

const labels: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting for verification",
  VERIFIED: "Verified",
  RETURNED: "Returned",
  NOT_STARTED: "Ready to start",
  IN_PROGRESS: "In progress",
  BLOCKED: "Needs help",
  PENDING_CHECK: "Waiting for completion check",
  COMPLETED: "Completed",
  OPEN: "Open",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
export function ExecutionStatus({ status }: { status: string }) {
  const tone = ["COMPLETED", "VERIFIED", "RESOLVED", "CLOSED"].includes(status)
    ? "bg-success-subtle text-success"
    : ["RETURNED", "BLOCKED", "PENDING_CHECK", "SUBMITTED"].includes(status)
      ? "bg-warning-subtle text-warning"
      : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      {labels[status] || status}
    </span>
  );
}
export function ExecutionHistoryModal({
  title,
  history,
  onClose,
}: {
  title: string;
  history: ExecutionHistory[];
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <HistoryList history={history} />
    </Modal>
  );
}
export function HistoryList({ history }: { history: ExecutionHistory[] }) {
  return history.length ? (
    <ol className="space-y-4">
      {[...history].reverse().map((entry, index) => (
        <li
          key={`${entry.at}:${index}`}
          className="border-l-2 border-border pl-4 text-sm"
        >
          <strong>{entry.event.replaceAll("_", " ")}</strong>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
            {entry.detail}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.name} · {new Date(entry.at).toLocaleString()}
          </p>
        </li>
      ))}
    </ol>
  ) : (
    <p className="text-sm text-muted-foreground">No updates yet.</p>
  );
}
export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
