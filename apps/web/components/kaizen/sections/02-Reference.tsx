"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { KaizenService, KaizenReferenceApplicability } from "@/services/kaizen.service";
import { REFERENCE_APPLICABILITY_LABELS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const APPLICABILITY_OPTIONS: KaizenReferenceApplicability[] = ["APPLICABLE", "NOT_APPLICABLE"];

const ReferenceSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function ReferenceSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [referenceValue, setReferenceValue] = useState(kaizen.referenceValue ?? "");
  const [applicability, setApplicability] = useState<KaizenReferenceApplicability | "">(
    kaizen.referenceApplicability ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      KaizenService.updateReference(
        kaizen.id,
        {
          referenceValue: referenceValue.trim() || undefined,
          referenceApplicability: applicability || undefined,
        },
        token,
      ),
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
        <SectionLabel n="1.2">Reference</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Applicability</p>
            <p className="text-sm text-slate-700">
              {kaizen.referenceApplicability ? REFERENCE_APPLICABILITY_LABELS[kaizen.referenceApplicability] : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reference</p>
            <p className="text-sm text-slate-700">{kaizen.referenceValue || "None"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <details
      open={!!(kaizen.referenceValue || kaizen.referenceApplicability)}
      className="group bg-white border border-slate-100 rounded-xl p-6 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700">
        <span>
          Linked to an alert, audit or other record?{" "}
          <span className="text-xs font-normal text-slate-400">(optional)</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 mt-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">Is there a reference?</label>
          <div className="flex flex-wrap gap-1.5">
            {APPLICABILITY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setApplicability(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  applicability === opt
                    ? "bg-[#52618a] border-[#52618a] text-white"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {REFERENCE_APPLICABILITY_LABELS[opt]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Reference number or name <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={referenceValue}
            onChange={(e) => setReferenceValue(e.target.value)}
            placeholder="e.g. Alert #123, Abnormality ref, audit finding ID..."
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </details>
  );
});

export default ReferenceSection;
