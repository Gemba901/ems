"use client";

import { useState } from "react";
import { Eye, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApprovedDirection, useDirectionHistory } from "@/hooks/leadership-excellence/useStrategicDirection";
import {
  FIELD_LABELS,
  type CoreValue,
  type DirectionEvent,
  type StrategicDirectionDraft,
  type TextField,
} from "@/services/leadership-excellence/strategic-direction.service";
import { DirectionReadView, type DirectionContent } from "./DirectionReadView";
import { Guide, Modal, SectionCard, formatDate } from "./ui";

type Open = "preview" | "history" | "approved" | null;

const approvalLine = (a: NonNullable<StrategicDirectionDraft["approved"]>) =>
  `Approved by ${a.approvedByName ?? "management"} · ${formatDate(a.approvedAt)}.`;

/** 01.03: preview the whole direction, read its history and the live approved version. */
export function ReviewSection({
  draft,
  content,
  dirty,
  number,
}: {
  draft: StrategicDirectionDraft;
  /** The form as typed, including unsaved changes. */
  content: DirectionContent;
  dirty: boolean;
  number?: string;
}) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  return (
    <SectionCard
      id="review-section"
      number={number}
      label="01.03 · Preview & review"
      title="Preview & finalise"
      description="Read the whole direction together before making it the approved version."
    >
      <Guide title="How review and revisions work">
        <p>
          Save draft keeps incomplete work. Preview shows the text as a reading page. Management can use Finalise &amp;
          lock when the required information is complete; an editor sends the draft for one review.
        </p>
        <p>
          Approved wording cannot be changed in place. Create a revision to change it. Employees keep seeing the
          approved version until the revision is approved.
        </p>
      </Guide>

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
        <summary className="cursor-pointer font-medium">What comes after Area 01?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Area 02 · Organisation &amp; Performance Framework:</strong> use EMS
            records to show units, departments, positions and reporting relationships.
          </li>
          <li>
            <strong className="text-foreground">Area 03 · Performance Planning &amp; Alignment:</strong> create
            objectives, linked goals and department plans.
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
      {draft.approved && (
        <ApprovedDialog open={open === "approved"} onClose={close} line={approvalLine(draft.approved)} />
      )}
    </SectionCard>
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
