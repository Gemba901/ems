"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileIcon, ImagePlus, Loader2, X } from "lucide-react";
import { KaizenService } from "@/services/kaizen.service";
import { uploadImage } from "@/services/uploads.service";
import { SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const MAX_FILES = 8;

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
}

const ConditionSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function ConditionSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [description, setDescription] = useState(kaizen.conditionDescription ?? "");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>(kaizen.conditionEvidenceUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (evidenceUrls.length + files.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => uploadImage(file, "kaizen", token)));
      setEvidenceUrls((prev) => [...prev, ...uploaded.map((u) => u.fileUrl)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setEvidenceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (description.trim().length < 10) {
        throw new Error("Describe the condition or opportunity in at least 10 characters.");
      }
      return KaizenService.updateCondition(kaizen.id, { conditionDescription: description.trim(), conditionEvidenceUrls: evidenceUrls }, token);
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  }));

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n={3}>Condition or Opportunity</SectionLabel>
        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{kaizen.conditionDescription}</p>
        {kaizen.conditionEvidenceUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {kaizen.conditionEvidenceUrls.map((url, i) =>
              isImageUrl(url) ? (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg overflow-hidden border border-slate-100 aspect-square block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ) : (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 aspect-square flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                >
                  <FileIcon className="h-6 w-6" />
                  <span className="text-[10px]">File {i + 1}</span>
                </a>
              ),
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={3}>Condition or Opportunity</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Describe the condition or improvement opportunity <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what was observed..."
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-700">
              Evidence <span className="text-xs font-normal text-slate-400">(any file type, optional)</span>
            </label>
            <span className="text-xs text-slate-400">{evidenceUrls.length}/{MAX_FILES}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {evidenceUrls.map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                {isImageUrl(url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400">
                    <FileIcon className="h-6 w-6" />
                    <span className="text-[10px]">File {i + 1}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {evidenceUrls.length < MAX_FILES && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {uploading ? "Uploading..." : "Add file"}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default ConditionSection;
