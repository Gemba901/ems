"use client";

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, Save, X } from "lucide-react";
import { KaizenService } from "@/services/kaizen.service";
import { uploadImage } from "@/services/uploads.service";
import { SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionProps } from "./types";

const MAX_PHOTOS = 5;

export default function ImplementationSection({ kaizen, access, token, onSaved }: KaizenSectionProps) {
  const [actionTaken, setActionTaken] = useState(kaizen.actionTaken ?? "");
  const [afterPhotoUrls, setAfterPhotoUrls] = useState<string[]>(kaizen.afterPhotoUrls ?? []);
  const [resultSaving, setResultSaving] = useState(kaizen.resultSaving ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (afterPhotoUrls.length + files.length > MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are allowed.");
        return;
      }
    }
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => uploadImage(file, "kaizen", token)));
      setAfterPhotoUrls((prev) => [...prev, ...uploaded.map((u) => u.fileUrl)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (index: number) => {
    setAfterPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (actionTaken.trim().length < 10) throw new Error("Describe the action taken in at least 10 characters.");
      if (afterPhotoUrls.length === 0) throw new Error("Attach at least one after photo.");
      return KaizenService.updateImplementation(
        kaizen.id,
        {
          actionTaken: actionTaken.trim(),
          afterPhotoUrls,
          resultSaving: resultSaving.trim() || undefined,
        },
        token,
      );
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  if (!access.visible) return null;

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n={3}>Implementation</SectionLabel>
        <p className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{kaizen.actionTaken || "No action recorded yet."}</p>
        {kaizen.afterPhotoUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {kaizen.afterPhotoUrls.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg overflow-hidden border border-slate-100 aspect-square block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
        {kaizen.resultSaving && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Result / Saving</p>
            <p className="text-sm text-slate-700">{kaizen.resultSaving}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={3}>Implementation</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Action taken <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
            placeholder="Describe what was implemented..."
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-700">
              After Photos <span className="text-red-500">*</span>
            </label>
            <span className="text-xs text-slate-400">{afterPhotoUrls.length}/{MAX_PHOTOS}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {afterPhotoUrls.map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {afterPhotoUrls.length < MAX_PHOTOS && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                {uploading ? "Uploading..." : "Add photo"}
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Result / Saving <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={resultSaving}
            onChange={(e) => setResultSaving(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <button
          type="button"
          disabled={mutation.isPending || uploading}
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>
    </div>
  );
}
