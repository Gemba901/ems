"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { SteelSourcingService, SteelSourcingStage } from "@/services/steel-sourcing.service";
import { uploadImage } from "@/services/uploads.service";

/**
 * Minimal reusable document panel for a P02 sourcing order: lists existing
 * attachments tagged to `stage`, lets the user pick a file (uploaded via the
 * existing generic S3 presigned-upload flow), and records the resulting URL
 * against the sourcing order. No versioning, no preview modal — list, add,
 * delete only.
 */
export function AttachmentPanel({
  sourcingId, stage, token, label = "Attachments",
}: { sourcingId: string; stage: SteelSourcingStage; token: string; label?: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["steel-sourcing-attachments", sourcingId],
    queryFn: () => SteelSourcingService.getAttachments(sourcingId, token),
    enabled: !!sourcingId && !!token,
  });

  const stageAttachments = attachments.filter((a) => a.stage === stage);

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) => SteelSourcingService.deleteAttachment(attachmentId, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["steel-sourcing-attachments", sourcingId] }),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { fileUrl } = await uploadImage(file, "steel-sourcing-attachments", token);
      await SteelSourcingService.addAttachment(sourcingId, { stage, fileName: file.name, fileUrl }, token);
      queryClient.invalidateQueries({ queryKey: ["steel-sourcing-attachments", sourcingId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-md border border-input bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
          <Paperclip className="h-3.5 w-3.5 text-blue-500" /> {label}
        </h4>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : "Add file"}
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading attachments…</p>
      ) : stageAttachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents attached for this stage yet.</p>
      ) : (
        <ul className="divide-y divide-input">
          {stageAttachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-1.5 text-xs">
              <a href={a.fileUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate max-w-[70%]">
                {a.fileName}
              </a>
              <div className="flex items-center gap-2 text-muted-foreground">
                {a.uploadedBy && <span>{a.uploadedBy.firstName} {a.uploadedBy.lastName}</span>}
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(a.id)}
                  disabled={deleteMutation.isPending}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${a.fileName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
