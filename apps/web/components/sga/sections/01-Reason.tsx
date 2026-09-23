"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService, SgaStartingReason, SgaReferenceApplicability, SgaReferenceType } from "@/services/sga.service";
import {
  STARTING_REASONS,
  REFERENCE_APPLICABILITY_LABELS,
  REFERENCE_TYPE_OPTIONS,
  SectionLabel,
} from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const REFERENCE_APPLICABILITY_OPTIONS: SgaReferenceApplicability[] = ["APPLICABLE", "NOT_APPLICABLE", "REFERENCE_NOT_FOUND"];

const EXPLANATION_MIN = 10;
const EXPLANATION_MAX = 1000;

const ReasonSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ReasonSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [startingReason, setStartingReason] = useState<SgaStartingReason | "">(sga.startingReason ?? "");
  const [startingReasonOther, setStartingReasonOther] = useState(sga.startingReasonOther ?? "");
  const [referenceApplicability, setReferenceApplicability] = useState<SgaReferenceApplicability | "">(
    sga.referenceApplicability ?? "",
  );
  const [referenceType, setReferenceType] = useState<SgaReferenceType | "">(sga.referenceType ?? "");
  const [referenceNumber, setReferenceNumber] = useState(sga.referenceNumber ?? "");
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const mutation = useMutation({
    mutationFn: () =>
      SgaService.updateReason(
        sga.id,
        {
          startingReason: startingReason as SgaStartingReason,
          startingReasonOther: startingReason === "OTHER" ? startingReasonOther.trim() : undefined,
          referenceApplicability: referenceApplicability ? (referenceApplicability as SgaReferenceApplicability) : undefined,
          referenceType: referenceApplicability === "APPLICABLE" ? (referenceType as SgaReferenceType) : undefined,
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
      if (
        startingReason === "OTHER" &&
        (startingReasonOther.trim().length < EXPLANATION_MIN || startingReasonOther.trim().length > EXPLANATION_MAX)
      ) {
        setError(`Please explain in ${EXPLANATION_MIN}-${EXPLANATION_MAX} characters.`);
        return false;
      }
      if (referenceApplicability === "APPLICABLE" && !referenceType) {
        setError("Please select the reference type.");
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
            disabled={!editable}
            onChange={(e) => {
              setStartingReason(e.target.value as SgaStartingReason);
              setError(null);
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
          >
            <option value="">Select a reason...</option>
            {STARTING_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {startingReason === "OTHER" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Please explain <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${startingReasonOther.length > EXPLANATION_MAX ? "text-red-500" : "text-slate-400"}`}>
                {startingReasonOther.length}/{EXPLANATION_MAX}
              </span>
            </div>
            <textarea
              rows={4}
              value={startingReasonOther}
              disabled={!editable}
              onChange={(e) => {
                setStartingReasonOther(e.target.value);
                setError(null);
              }}
              placeholder="Describe why this SGA was started..."
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        )}

        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Reference applicability <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <select
            value={referenceApplicability}
            disabled={!editable}
            onChange={(e) => {
              setReferenceApplicability(e.target.value as SgaReferenceApplicability);
              setError(null);
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
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
              Reference type <span className="text-red-500">*</span>
            </label>
            <select
              value={referenceType}
              disabled={!editable}
              onChange={(e) => {
                setReferenceType(e.target.value as SgaReferenceType);
                setError(null);
              }}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">Select...</option>
              {REFERENCE_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {referenceApplicability === "APPLICABLE" && (
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Reference number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={referenceNumber}
              disabled={!editable}
              onChange={(e) => {
                setReferenceNumber(e.target.value);
                setError(null);
              }}
              placeholder="e.g. AUDIT-2026-014"
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
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
