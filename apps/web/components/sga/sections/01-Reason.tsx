"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService, SgaStartingReason, SgaReferenceApplicability } from "@/services/sga.service";
import { STARTING_REASONS, REFERENCE_APPLICABILITY_LABELS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const REFERENCE_APPLICABILITY_OPTIONS: SgaReferenceApplicability[] = ["APPLICABLE", "NOT_APPLICABLE", "REFERENCE_NOT_FOUND"];

const ReasonSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ReasonSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [startingReason, setStartingReason] = useState<SgaStartingReason | "">(sga.startingReason ?? "");
  const [referenceApplicability, setReferenceApplicability] = useState<SgaReferenceApplicability | "">(
    sga.referenceApplicability ?? "",
  );
  const [referenceNumber, setReferenceNumber] = useState(sga.referenceNumber ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      SgaService.updateReason(
        sga.id,
        {
          startingReason: startingReason as SgaStartingReason,
          referenceApplicability: referenceApplicability ? (referenceApplicability as SgaReferenceApplicability) : undefined,
          referenceNumber: referenceApplicability === "APPLICABLE" ? referenceNumber.trim() : undefined,
        },
        token,
      ),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!startingReason) {
        setError("Please select why this SGA was started.");
        return false;
      }
      if (referenceApplicability === "APPLICABLE" && !referenceNumber.trim()) {
        setError("Please provide the reference number.");
        return false;
      }
      setError(null);
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  }));

  const reasonLabel = STARTING_REASONS.find((r) => r.value === sga.startingReason);

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.1">Reason</SectionLabel>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Why was this SGA started?
            </p>
            <p className="text-sm text-slate-700">{reasonLabel?.label ?? sga.startingReason ?? "Not set"}</p>
          </div>
          {sga.referenceApplicability && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Reference</p>
              <p className="text-sm text-slate-700">
                {REFERENCE_APPLICABILITY_LABELS[sga.referenceApplicability]}
                {sga.referenceApplicability === "APPLICABLE" && sga.referenceNumber ? ` - ${sga.referenceNumber}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.1">Reason</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Why was this SGA started? <span className="text-red-500">*</span>
          </label>
          <select
            value={startingReason}
            onChange={(e) => {
              setStartingReason(e.target.value as SgaStartingReason);
              setError(null);
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select a reason...</option>
            {STARTING_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Reference applicability <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <select
            value={referenceApplicability}
            onChange={(e) => {
              setReferenceApplicability(e.target.value as SgaReferenceApplicability);
              setError(null);
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select...</option>
            {REFERENCE_APPLICABILITY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {REFERENCE_APPLICABILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        {referenceApplicability === "APPLICABLE" && (
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Reference number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={(e) => {
                setReferenceNumber(e.target.value);
                setError(null);
              }}
              placeholder="e.g. AUDIT-2026-014"
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        )}

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

export default ReasonSection;
