"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { KaizenService, KaizenTrigger } from "@/services/kaizen.service";
import { KAIZEN_TRIGGERS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const EXPLANATION_MIN = 10;
const EXPLANATION_MAX = 1000;

const ReasonSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function ReasonSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [trigger, setTrigger] = useState<KaizenTrigger | "">(kaizen.trigger ?? "");
  const [triggerOther, setTriggerOther] = useState(kaizen.triggerOther ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      KaizenService.updateReason(
        kaizen.id,
        { trigger: trigger as KaizenTrigger, triggerOther: trigger === "OTHER" ? triggerOther.trim() : undefined },
        token,
      ),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!trigger) {
        setError("Please select why this Daily Kaizen was started.");
        return false;
      }
      if (trigger === "OTHER" && (triggerOther.trim().length < EXPLANATION_MIN || triggerOther.trim().length > EXPLANATION_MAX)) {
        setError(`Please explain in ${EXPLANATION_MIN}-${EXPLANATION_MAX} characters.`);
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

  const trigLabel = KAIZEN_TRIGGERS.find((t) => t.value === kaizen.trigger);

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n={1}>Reason</SectionLabel>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Why was this Daily Kaizen started?
            </p>
            <p className="text-sm text-slate-700">{trigLabel?.label ?? kaizen.trigger ?? "Not set"}</p>
          </div>
          {kaizen.trigger === "OTHER" && kaizen.triggerOther && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Explanation</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{kaizen.triggerOther}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={1}>Reason</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Why was this Daily Kaizen started? <span className="text-red-500">*</span>
          </label>
          <select
            value={trigger}
            onChange={(e) => {
              setTrigger(e.target.value as KaizenTrigger);
              setError(null);
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select a reason...</option>
            {KAIZEN_TRIGGERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {trigger === "OTHER" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Please explain <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${triggerOther.length > EXPLANATION_MAX ? "text-red-500" : "text-slate-400"}`}>
                {triggerOther.length}/{EXPLANATION_MAX}
              </span>
            </div>
            <textarea
              rows={4}
              value={triggerOther}
              onChange={(e) => {
                setTriggerOther(e.target.value);
                setError(null);
              }}
              placeholder="Describe why this Daily Kaizen was started..."
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
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
