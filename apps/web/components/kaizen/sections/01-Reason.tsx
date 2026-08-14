"use client";

import { KAIZEN_TRIGGERS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionProps } from "./types";

export default function ReasonSection({ kaizen }: KaizenSectionProps) {
  const trigger = KAIZEN_TRIGGERS.find((t) => t.value === kaizen.trigger);
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n={1}>Reason</SectionLabel>
      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Why was this Daily Kaizen started?
          </p>
          <p className="text-sm text-slate-700">{trigger?.label ?? kaizen.trigger}</p>
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
