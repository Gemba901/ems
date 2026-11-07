"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
  PerformancePlanningService,
  type PlanningDocument,
} from "@/services/leadership-excellence/performance-planning.service";
import { usePlanning } from "./PlanningProvider";
import { Button } from "@/components/ui/button";
import { ErrorList } from "./PlanningUi";
export function PlanningEvidence({
  document,
  findingId,
  editable,
  expectedRevision,
  onUploaded,
}: {
  document: PlanningDocument;
  findingId: string;
  editable: boolean;
  expectedRevision?: number;
  onUploaded?: (revision: number) => void;
}) {
  const token = useAuthStore((s) => s.accessToken);
  const { data, refresh } = usePlanning();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: [
      "lex-planning-evidence",
      data.actor.userId,
      document.id,
      findingId,
    ],
    queryFn: () =>
      PerformancePlanningService.evidence(token!, document.id, findingId),
    enabled: !!token,
  });
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium">Supporting files</h3>
      <ErrorList error={error || query.error?.message || ""} />
      {query.data?.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="break-all">
            {file.name}{" "}
            <span className="text-xs text-muted-foreground">
              ({Math.ceil(file.size / 1024)} KB)
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              void PerformancePlanningService.downloadEvidence(
                token!,
                document.id,
                findingId,
                file,
              ).catch((e) => setError(e.message))
            }
          >
            Download
          </Button>
        </div>
      ))}
      {!query.isPending && !query.data?.length && (
        <p className="text-xs text-muted-foreground">No files attached.</p>
      )}
      {editable &&
        !document.versions.some((v) =>
          v.data.findings.some((f) => f.id === findingId),
        ) && (
          <label className="block text-xs text-muted-foreground">
            Attach up to five files, 500 KB each. PDF, images, Office documents
            or text.
            <input
              className="mt-2 block w-full text-sm"
              type="file"
              disabled={busy}
              accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (expectedRevision === undefined) {
                  setError(
                    "Close and reopen the finding before attaching evidence.",
                  );
                  return;
                }
                const uploadRevision = expectedRevision;
                setBusy(true);
                setError("");
                try {
                  await PerformancePlanningService.uploadEvidence(
                    token!,
                    document.id,
                    findingId,
                    uploadRevision,
                    file,
                  );
                  // Only our own successful upload advances the form snapshot.
                  // Concurrent edits before/after it still fail the server CAS.
                  onUploaded?.(uploadRevision + 1);
                  await query.refetch();
                  refresh();
                } catch (c) {
                  setError(
                    `${c instanceof Error ? c.message : "Upload failed."} If planning records changed, close and reopen this finding before retrying.`,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        )}
    </section>
  );
}
