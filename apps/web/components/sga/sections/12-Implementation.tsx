"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { TenantFileLink } from "@/components/files/TenantFileLink";
import { TenantImage } from "@/components/files/TenantImage";
import { uploadImage } from "@/services/uploads.service";
import { SgaImplementationStatus, SgaService } from "@/services/sga.service";
import { CurrencySelect, IMPLEMENTATION_STATUS_LABELS, IMPLEMENTATION_STATUS_OPTIONS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const MAX_PHOTOS = 8;

const ImplementationSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ImplementationSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [implementationSummary, setImplementationSummary] = useState(sga.implementationSummary ?? "");
  const [afterFileUrls, setAfterFileUrls] = useState<string[]>(sga.afterFileUrls ?? []);
  const [actualImplementationCost, setActualImplementationCost] = useState(sga.actualImplementationCost ?? "");
  const [actualImplementationCostCurrency, setActualImplementationCostCurrency] = useState(sga.actualImplementationCostCurrency ?? "");
  const [implementationStatus, setImplementationStatus] = useState<SgaImplementationStatus>(sga.implementationStatus ?? "NOT_STARTED");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (afterFileUrls.length + files.length > MAX_PHOTOS) {
      setError(`You can attach up to ${MAX_PHOTOS} files.`);
      return;
    }
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => uploadImage(file, "sga", token)));
      setAfterFileUrls((prev) => [...prev, ...uploaded.map((u) => u.fileUrl)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setAfterFileUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (actualImplementationCost && !actualImplementationCostCurrency) {
        throw new Error("Select a currency for the actual implementation cost.");
      }
      return SgaService.updateImplementation(
        sga.id,
        {
          implementationSummary: implementationSummary.trim() || undefined,
          afterFileUrls,
          actualImplementationCost: actualImplementationCost ? Number(actualImplementationCost) : undefined,
          actualImplementationCostCurrency: actualImplementationCost ? actualImplementationCostCurrency : undefined,
          implementationStatus,
        },
        token,
      );
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

  if (!access.visible) return null;

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="4.2">Implementation</SectionLabel>
        <div className="space-y-3 mb-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</p>
            <p className="text-sm text-slate-700">{IMPLEMENTATION_STATUS_LABELS[sga.implementationStatus]}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Summary</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sga.implementationSummary || "Not set."}</p>
          </div>
          {sga.actualImplementationCost && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Actual Cost</p>
              <p className="text-sm text-slate-700">
                {sga.actualImplementationCostCurrency} {sga.actualImplementationCost}
              </p>
            </div>
          )}
        </div>
        {sga.afterFileUrls.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {sga.afterFileUrls.map((url, i) => (
              <TenantFileLink key={url} href={url} target="_blank" rel="noreferrer" className="rounded-lg overflow-hidden border border-slate-100 aspect-square block">
                <TenantImage src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
              </TenantFileLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="4.2">Implementation</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">Status</label>
          <select
            value={implementationStatus}
            onChange={(e) => setImplementationStatus(e.target.value as SgaImplementationStatus)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            {IMPLEMENTATION_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Implementation summary <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            rows={4}
            value={implementationSummary}
            onChange={(e) => setImplementationSummary(e.target.value)}
            placeholder="Describe what was implemented..."
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-700">
              After files <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <span className="text-xs text-slate-400">{afterFileUrls.length}/{MAX_PHOTOS}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {afterFileUrls.map((url, i) => (
              <div key={url} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                <TenantImage src={url} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-slate-900/60 hover:bg-slate-900/80 flex items-center justify-center text-white transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {afterFileUrls.length < MAX_PHOTOS && (
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
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Actual implementation cost <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <div className="flex gap-2 min-w-0">
            <input
              type="number"
              min="0"
              step="0.01"
              value={actualImplementationCost}
              onChange={(e) => setActualImplementationCost(e.target.value)}
              className="flex-1 min-w-0 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            <CurrencySelect value={actualImplementationCostCurrency} onChange={setActualImplementationCostCurrency} className="w-32 shrink-0" />
          </div>
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

export default ImplementationSection;
