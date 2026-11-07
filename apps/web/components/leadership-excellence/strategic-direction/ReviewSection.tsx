"use client";

import { useState } from "react";
import { Eye, History, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast.context";
import {
  useApprovedDirection,
  useApproverCandidates,
  useDirectionHistory,
  type useDirectionActions,
} from "@/hooks/leadership-excellence/useStrategicDirection";
import {
  FIELD_LABELS,
  type CoreValue,
  type DirectionEvent,
  type StrategicDirectionDraft,
  type TextField,
} from "@/services/leadership-excellence/strategic-direction.service";
import { DirectionReadView, type DirectionContent } from "./DirectionReadView";
import { EYEBROW, Guide, Modal, SectionCard, formatDate } from "./ui";

type Open = "preview" | "history" | "approved" | "approvers" | null;

const approvalLine = (a: NonNullable<StrategicDirectionDraft["approved"]>) =>
  `Approved by ${a.approvedByName ?? "an approver"} · ${formatDate(a.approvedAt)}.`;

/** 01.03: approvers, preview of the whole direction, its history and the live approved version. */
export function ReviewSection({
  draft,
  content,
  dirty,
  number,
  canManageApprovers,
  actions,
}: {
  draft: StrategicDirectionDraft;
  /** The form as typed, including unsaved changes. */
  content: DirectionContent;
  dirty: boolean;
  number?: string;
  canManageApprovers: boolean;
  actions: ReturnType<typeof useDirectionActions>;
}) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  return (
    <SectionCard
      id="review-section"
      number={number}
      label="01.03 · Preview & review"
      title="Preview & send for review"
      description="Read the whole direction together, then send it to the approvers."
    >
      <Guide title="How review and revisions work">
        <p>
          Save draft keeps incomplete work. Preview shows the text as a reading page. When the required information is
          complete, send it for review. One of the approvers the company has chosen approves it or returns it with a
          note. Nobody approves their own submission.
        </p>
        <p>
          Approved wording cannot be changed in place. Create a revision to change it. Employees keep seeing the
          approved version until the revision is approved.
        </p>
      </Guide>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={EYEBROW}>Approvers</div>
          {canManageApprovers && (
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen("approvers")}>
              <UserCheck /> Choose approvers
            </Button>
          )}
        </div>
        {draft.approvers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No approvers chosen yet. {canManageApprovers ? "Choose at least one." : "An admin needs to choose them."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {draft.approvers.map((a) => (
              <li key={a.employeeId} className="rounded-md bg-secondary px-2.5 py-1 text-sm text-secondary-foreground">
                {a.name}
                {a.jobTitle && <span className="text-muted-foreground"> · {a.jobTitle}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setOpen("preview")}>
          <Eye /> Preview company direction
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen("history")}>
          <History /> View change history
        </Button>
        {draft.approved && (
          <Button type="button" variant="ghost" onClick={() => setOpen("approved")}>
            View approved version
          </Button>
        )}
      </div>

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        {draft.approved
          ? `Published version ${draft.approved.version} · ${approvalLine(draft.approved)}`
          : "No approved version yet."}
      </p>

      <details className="group rounded-lg border border-border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">What comes after Key Functional Area 1?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">
              Key Functional Area 2 · Organisation &amp; Performance Framework:
            </strong>{" "}
            use EMS records to show units, departments, positions and reporting relationships.
          </li>
          <li>
            <strong className="text-foreground">Key Functional Area 3 · Performance Planning &amp; Alignment:</strong>{" "}
            create objectives, linked goals and department plans.
          </li>
        </ul>
        <p className="mt-2 text-muted-foreground">Your company direction is reused rather than entered again.</p>
      </details>

      <Modal open={open === "preview"} size="lg" title="Company direction" eyebrow="Draft preview" onClose={close}>
        <DirectionReadView
          content={content}
          eyebrow="Draft preview"
          summary={`This is a preview, not a published approval.${dirty ? " It includes your unsaved writing." : ""}`}
          showPillars
        />
      </Modal>
      <HistoryDialog open={open === "history"} onClose={close} />
      {canManageApprovers && (
        <ApproversDialog
          open={open === "approvers"}
          onClose={close}
          current={draft.approvers.map((a) => a.employeeId)}
          save={actions.setApprovers}
        />
      )}
      {draft.approved && (
        <ApprovedDialog open={open === "approved"} onClose={close} line={approvalLine(draft.approved)} />
      )}
    </SectionCard>
  );
}

function ApproversDialog({
  open,
  onClose,
  current,
  save,
}: {
  open: boolean;
  onClose: () => void;
  current: string[];
  save: ReturnType<typeof useDirectionActions>["setApprovers"];
}) {
  const { toast } = useToast();
  const candidates = useApproverCandidates({ enabled: open });
  // Picked ids; null means "start from the saved list" so reopening resets it.
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosen = picked ?? current;
  const toggle = (id: string) => setPicked(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const closeAndReset = () => {
    setPicked(null);
    onClose();
  };

  async function submit() {
    try {
      await save.mutateAsync(chosen);
      toast("Approvers saved.", "success");
      closeAndReset();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not save the approvers.", "error");
    }
  }

  return (
    <Modal open={open} title="Choose approvers" eyebrow="Company direction" onClose={closeAndReset}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every change sent for review goes to these people. Any one of them can approve it or return it, but not their
          own submission, so choose at least two if approvers also write the direction.
        </p>
        {candidates.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : candidates.isError ? (
          <p className="text-sm text-destructive">Could not load staff. {(candidates.error as Error).message}</p>
        ) : candidates.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current management, admin or super admin staff found.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {candidates.data.map((c) => (
              <li key={c.employeeId}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={chosen.includes(c.employeeId)}
                    onChange={() => toggle(c.employeeId)}
                  />
                  <span>
                    {c.name}
                    {c.jobTitle && <span className="text-muted-foreground"> · {c.jobTitle}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={closeAndReset}>
            Cancel
          </Button>
          <Button type="button" disabled={save.isPending || candidates.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save approvers"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ApprovedDialog({ open, onClose, line }: { open: boolean; onClose: () => void; line: string }) {
  const approved = useApprovedDirection({ enabled: open });
  return (
    <Modal open={open} size="lg" title="Approved company direction" onClose={onClose}>
      {approved.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : approved.isError ? (
        <p className="text-sm text-destructive">Could not load it. {(approved.error as Error).message}</p>
      ) : approved.data ? (
        <DirectionReadView
          content={approved.data}
          eyebrow={`Approved company direction · Version ${approved.data.version}`}
          summary={`${line} This is the published version. Any draft revision is not shown here.`}
          showPillars
        />
      ) : (
        <p className="text-sm text-muted-foreground">No approved version yet.</p>
      )}
    </Modal>
  );
}

const ACTION_LABELS: Record<DirectionEvent["action"], string> = {
  DRAFT_SAVED: "Draft saved",
  SUBMITTED: "Sent for review",
  RETURNED: "Returned for changes",
  WITHDRAWN: "Withdrawn to edit",
  APPROVED: "Approved & locked",
  REVISION_STARTED: "Revision started",
};

function changeLabel(field: string) {
  if (field === "values") return "Core values";
  return FIELD_LABELS[field as TextField] ?? field;
}

function changeText(value: unknown): string {
  if (Array.isArray(value)) {
    const names = (value as CoreValue[]).map((v) => v.name).filter(Boolean);
    return names.length ? names.join(", ") : "";
  }
  return typeof value === "string" ? value : "";
}

function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const history = useDirectionHistory({ enabled: open });
  return (
    <Modal open={open} size="lg" title="Change history" onClose={onClose}>
      {history.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : history.isError ? (
        <p className="text-sm text-destructive">Could not load the history. {(history.error as Error).message}</p>
      ) : history.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {history.data.map((event) => {
            const changes = Object.entries(event.changes ?? {});
            return (
              <li key={event.id} className="rounded-lg border border-border p-4">
                <div className="text-sm font-medium">
                  {ACTION_LABELS[event.action]}
                  {event.action === "APPROVED" && event.version != null && ` · version ${event.version}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(event.createdAt)}
                  {event.actorName && ` · ${event.actorName}`}
                </div>
                {event.reason && <p className="mt-2 text-sm">Reason: {event.reason}</p>}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    What changed? ({changes.length})
                  </summary>
                  {changes.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">No wording changed in this step.</p>
                  ) : (
                    <dl className="mt-2 space-y-3">
                      {changes.map(([field, change]) => (
                        <div key={field} className="space-y-1">
                          <dt className="text-xs font-semibold">{changeLabel(field)}</dt>
                          <dd className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-md bg-muted/50 p-2">
                              <div className="text-[11px] font-medium text-muted-foreground uppercase">Before</div>
                              <p className="text-sm whitespace-pre-line">{changeText(change.from) || "Not entered"}</p>
                            </div>
                            <div className="rounded-md bg-secondary p-2">
                              <div className="text-[11px] font-medium text-muted-foreground uppercase">After</div>
                              <p className="text-sm whitespace-pre-line">{changeText(change.to) || "Not entered"}</p>
                            </div>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </Modal>
  );
}
