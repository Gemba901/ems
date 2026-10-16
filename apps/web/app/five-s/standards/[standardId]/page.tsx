"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Pencil } from "lucide-react";
import { useApproveStandard, useDeleteStandardDraft, useFiveSStandard, useReviseStandard, useUpdateStandard } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { StandardForm } from "@/components/five-s/standards/StandardForm";
import {
  ErrorNote,
  FileList,
  FiveSDialog,
  KeyValue,
  Loading,
  StandardStatusBadge,
  Surface,
  dangerButton,
  errorMessage,
  formatTimestamp,
  linkButton,
  primaryButton,
  secondaryButton,
} from "@/components/five-s/ui";
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

  if (isLoading) return <Loading label="Loading standard…" />;
  if (error || !s) return <ErrorNote>{errorMessage(error, "Standard not found")}</ErrorNote>;

  const fail = (e: unknown) => toast(errorMessage(e), "error");

  return (
    <div className="space-y-6">
      <Link href={`/five-s/standards?areaId=${s.area.id}`} className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Standards & routines
      </Link>

      {s.status === "SUPERSEDED" && s.currentApprovedId && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          You are viewing an old revision.{" "}
          <Link href={`/five-s/standards/${s.currentApprovedId}`} className="font-semibold underline">
            Open the current approved revision
          </Link>
        </p>
      )}
      {s.status === "DRAFT" && s.currentApprovedId && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Draft revision. Until it is approved,{" "}
          <Link href={`/five-s/standards/${s.currentApprovedId}`} className="font-semibold underline">
            the current approved revision
          </Link>{" "}
          still applies.
        </p>
      )}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{s.title}</h1>
            <StandardStatusBadge status={s.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Revision {s.revision} ·{" "}
            <Link href={`/five-s/areas/${s.area.id}`} className="text-blue-700 hover:underline">
              {s.area.name}
            </Link>{" "}
            · Owner: {s.owner?.name ?? "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.status === "DRAFT" && s.permissions.canEdit && (
            <>
              <button type="button" className={dangerButton} onClick={() => setDialog("delete")}>
                Delete draft
              </button>
              <button type="button" className={secondaryButton} onClick={() => setDialog("edit")}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit draft
              </button>
            </>
          )}
          {s.status === "DRAFT" && s.permissions.canApprove && (
            <button type="button" className={primaryButton} onClick={() => setDialog("approve")}>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approve
            </button>
          )}
          {s.status === "APPROVED" && s.permissions.canRevise && !s.hasOpenDraft && (
            <button
              type="button"
              className={secondaryButton}
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
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Surface className={cn("space-y-4 p-5", s.status === "APPROVED" && "border-2 border-emerald-300", s.status === "DRAFT" && "border-2 border-dashed border-amber-300")}>
          <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{s.instructions}</p>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Reference photos and documents</p>
            <FileList urls={s.referenceUrls} />
          </div>
          {s.changeNote && <KeyValue label="Change note">{s.changeNote}</KeyValue>}
          {s.approvedAt && (
            <p className="text-xs text-slate-500">
              Approved by {s.approvedBy?.name ?? "—"} on {formatTimestamp(s.approvedAt)}
            </p>
          )}
        </Surface>

        <Surface>
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">Revisions</h2>
          <ol className="divide-y divide-slate-100">
            {s.revisions.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/five-s/standards/${r.id}`}
                  aria-current={r.id === s.id ? "page" : undefined}
                  className={cn("block px-4 py-3 hover:bg-slate-50", r.id === s.id && "bg-blue-50/60")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900">Revision {r.revision}</span>
                    <StandardStatusBadge status={r.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.approvedAt ? `Approved ${formatTimestamp(r.approvedAt)} by ${r.approvedBy?.name ?? "—"}` : `Created ${formatTimestamp(r.createdAt)}`}
                  </p>
                  {r.changeNote && <p className="mt-0.5 text-xs text-slate-600">{r.changeNote}</p>}
                </Link>
              </li>
            ))}
          </ol>
        </Surface>
      </div>

      <FiveSDialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)} title={`Edit revision ${s.revision}`} size="lg">
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
      </FiveSDialog>

      <FiveSDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Approve revision ${s.revision}?`}
        description={s.currentApprovedId ? "It becomes the current standard and the previous approved revision is marked superseded. Approved revisions are locked." : "It becomes the current standard. Approved revisions are locked."}
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={primaryButton}
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
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">{s.title}</p>
      </FiveSDialog>

      <FiveSDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Delete this draft revision?"
        description="Approved and superseded revisions are kept permanently."
        footer={
          <>
            <button type="button" className={secondaryButton} onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={dangerButton}
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
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          {s.title} · revision {s.revision}
        </p>
      </FiveSDialog>
    </div>
  );
}
