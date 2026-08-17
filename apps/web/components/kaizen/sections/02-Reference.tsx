"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { KaizenService, KaizenReferenceApplicability } from "@/services/kaizen.service";
import { REFERENCE_APPLICABILITY_LABELS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const APPLICABILITY_OPTIONS: KaizenReferenceApplicability[] = ["APPLICABLE", "NOT_APPLICABLE", "REFERENCE_NOT_FOUND"];

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
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.2">Reference</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">
        If this kaizen was triggered by an alert, abnormality, audit finding, or other record, reference it here.
      </p>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">Is a reference applicable?</label>
          <div className="flex flex-wrap gap-1.5">
            {APPLICABILITY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setApplicability(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  applicability === opt
                    ? "bg-blue-600 border-blue-600 text-white"
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
            Reference value <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={referenceValue}
            onChange={(e) => setReferenceValue(e.target.value)}
            placeholder="e.g. Alert #123, Abnormality ref, audit finding ID..."
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
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

export default ReferenceSection;
