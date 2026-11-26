"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { WorkflowDialog } from "@/components/five-s/WorkflowDialog";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { useApproveStandard, useDeleteStandardDraft, useFiveSStandard, useReviseStandard, useUpdateStandard } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { StandardForm } from "@/components/five-s/standards/StandardForm";
import {
  FileList,
  HEADER_ACTIONS,
  KeyValue,
  StandardStatusBadge,
  errorMessage,
  formatTimestamp,
} from "@/components/five-s/ui";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
import { cn } from "@/lib/utils";

export default function StandardDetailPage() {
  const { standardId } = useParams<{ standardId: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data: s, isLoading, error } = useFiveSStandard(standardId);
  const update = useUpdateStandard();
  const approve = useApproveStandard();
  const revise = useReviseStandard();
  const remove = useDeleteStandardDraft();
  const [dialog, setDialog] = useState<"edit" | "approve" | "delete" | null>(null);

  if (isLoading) return <LoadingState label="Loading standard…" />;
  if (error || !s) return <ErrorState description={errorMessage(error, "Standard not found")} />;

  const fail = (e: unknown) => toast(errorMessage(e), "error");

  return (
    <div className="space-y-section">
      <Link href={`/five-s/standards?areaId=${s.area.id}`} className={buttonVariants({ variant: "ghost" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Standards & routines
      </Link>

      {s.status === "SUPERSEDED" && s.currentApprovedId && (
        <p className="rounded-lg bg-warning-subtle px-4 py-2 text-sm text-warning">
          You are viewing an old revision.{" "}
          <Link href={`/five-s/standards/${s.currentApprovedId}`} className="font-semibold underline">
            Open the current approved revision
          </Link>
        </p>
      )}
      {s.status === "DRAFT" && s.currentApprovedId && (
        <p className="rounded-lg bg-warning-subtle px-4 py-2 text-sm text-warning">
          Draft revision. Until it is approved,{" "}
          <Link href={`/five-s/standards/${s.currentApprovedId}`} className="font-semibold underline">
            the current approved revision
          </Link>{" "}
          still applies.
        </p>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{s.title}</h1>
            <StandardStatusBadge status={s.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Revision {s.revision} ·{" "}
            <Link href={`/five-s/areas/${s.area.id}`} className="text-info hover:underline">
              {s.area.name}
            </Link>{" "}
            · Owner: {s.owner?.name ?? "—"}
          </p>
        </div>
        <div className={HEADER_ACTIONS}>
          {s.status === "DRAFT" && s.permissions.canEdit && (
            <>
              <Button type="button" variant="destructive" onClick={() => setDialog("delete")}>
                Delete draft
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialog("edit")}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit draft
              </Button>
            </>
          )}
          {s.status === "DRAFT" && s.permissions.canApprove && (
            <Button type="button" onClick={() => setDialog("approve")}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve
            </Button>
          )}
          {s.status === "APPROVED" && s.permissions.canRevise && !s.hasOpenDraft && (
            <Button
              type="button"
              variant="outline"
              disabled={revise.isPending}
              onClick={() =>
                revise.mutate(s.id, {
                  onSuccess: (draft) => {
                    toast(`Revision ${draft.revision} started as a draft`, "success");
                    router.push(`/five-s/standards/${draft.id}`);
                  },
                  onError: fail,
                })
              }
            >
              Start a new revision
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className={cn("block space-y-4 p-5", s.status === "APPROVED" && "border-2 border-success", s.status === "DRAFT" && "border-2 border-dashed border-warning")}>
          <p className="whitespace-pre-line text-sm leading-6 text-foreground">{s.instructions}</p>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reference photos and documents</p>
            <FileList urls={s.referenceUrls} />
          </div>
          {s.changeNote && <KeyValue label="Change note">{s.changeNote}</KeyValue>}
          {(s.sourceKaizen || s.sourceSga) && (
            <div className="flex flex-wrap items-center gap-2">
              {s.sourceKaizen && (
                <LinkedRecordChip label="Standardised from Kaizen:" title={s.sourceKaizen.title} href={`/kaizen/${s.sourceKaizen.id}`} tone="kaizen" />
              )}
              {s.sourceSga && <LinkedRecordChip label="Standardised from SGA:" title={s.sourceSga.title} href={`/sga/${s.sourceSga.id}`} tone="sga" />}
              {(s.permissions.canEdit || s.permissions.canRevise) && (
                // A standard holds when someone checks it: a routine puts that check on DWMS (join 5).
                <Link href={`/five-s/standards/routines/new?areaId=${s.area.id}`} className={buttonVariants({ variant: "ghost" })}>
                  Add a routine to check it
                </Link>
              )}
            </div>
          )}
          {s.approvedAt && (
            <p className="text-xs text-muted-foreground">
              Approved by {s.approvedBy?.name ?? "—"} on {formatTimestamp(s.approvedAt)}
            </p>
          )}
        </Card>

        <Card className="block py-0">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Revisions</h2>
          <ol className="divide-y divide-border">
            {s.revisions.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/five-s/standards/${r.id}`}
                  aria-current={r.id === s.id ? "page" : undefined}
                  className={cn("block px-4 py-3 hover:bg-muted", r.id === s.id && "bg-info-subtle/60")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">Revision {r.revision}</span>
                    <StandardStatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.approvedAt ? `Approved ${formatTimestamp(r.approvedAt)} by ${r.approvedBy?.name ?? "—"}` : `Created ${formatTimestamp(r.createdAt)}`}
                  </p>
                  {r.changeNote && <p className="mt-0.5 text-xs text-muted-foreground">{r.changeNote}</p>}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <WorkflowDialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)} title={`Edit revision ${s.revision}`} size="lg">
        <StandardForm
          mode="edit"
          initial={{ areaId: s.area.id, title: s.title, instructions: s.instructions, ownerId: s.owner?.id ?? null, referenceUrls: s.referenceUrls, changeNote: s.changeNote }}
          submitLabel="Save draft"
          busy={update.isPending}
          error={update.error ? errorMessage(update.error) : null}
          onCancel={() => setDialog(null)}
          onSubmit={({ title, instructions, ownerId, referenceUrls, changeNote }) =>
            update.mutate(
              { id: s.id, body: { title, instructions, ownerId, referenceUrls, changeNote } },
              {
                onSuccess: () => {
                  toast("Draft saved", "success");
                  setDialog(null);
                },
              },
            )
          }
        />
      </WorkflowDialog>

      <WorkflowDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Approve revision ${s.revision}?`}
        description={s.currentApprovedId ? "It becomes the current standard and the previous approved revision is marked superseded. Approved revisions are locked." : "It becomes the current standard. Approved revisions are locked."}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate(s.id, {
                  onSuccess: () => {
                    toast("Approved. This is now the current standard.", "success");
                    setDialog(null);
                  },
                  onError: fail,
                })
              }
            >
              {approve.isPending ? "Approving…" : "Approve"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{s.title}</p>
      </WorkflowDialog>

      <WorkflowDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Delete this draft revision?"
        description="Approved and superseded revisions are kept permanently."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(s.id, {
                  onSuccess: () => {
                    toast("Draft deleted", "success");
                    router.push(s.currentApprovedId ? `/five-s/standards/${s.currentApprovedId}` : "/five-s/standards");
                  },
                  onError: fail,
                })
              }
            >
              {remove.isPending ? "Deleting…" : "Delete draft"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {s.title} · revision {s.revision}
        </p>
      </WorkflowDialog>
    </div>
  );
}
