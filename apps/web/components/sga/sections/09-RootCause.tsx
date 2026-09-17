"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { SgaService, SgaFishboneCategory, SgaRootCauseTool } from "@/services/sga.service";
import { FISHBONE_CATEGORIES, ROOT_CAUSE_TOOL_LABELS, ROOT_CAUSE_TOOL_OPTIONS, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

interface FishboneRow {
  id?: string;
  category: SgaFishboneCategory;
  description: string;
}

const FishboneSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function RootCauseSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [rootCauseTools, setRootCauseTools] = useState<SgaRootCauseTool[]>(sga.rootCauseTools ?? []);
  const [otherAnalysisNotes, setOtherAnalysisNotes] = useState(sga.otherAnalysisNotes ?? "");
  const [fishboneCauses, setFishboneCauses] = useState<FishboneRow[]>(
    sga.fishboneCauses.map((f) => ({ id: f.id, category: f.category, description: f.description })),
  );
  const [error, setError] = useState<string | null>(null);

  const toggleTool = (tool: SgaRootCauseTool) => {
    setRootCauseTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  const addCause = (category: SgaFishboneCategory) => {
    setFishboneCauses((prev) => [...prev, { category, description: "" }]);
  };

  const updateCause = (index: number, description: string) => {
    setFishboneCauses((prev) => prev.map((c, i) => (i === index ? { ...c, description } : c)));
  };

  const removeCause = (index: number) => {
    setFishboneCauses((prev) => prev.filter((_, i) => i !== index));
  };

  const mutation = useMutation({
    mutationFn: () => {
      for (const c of fishboneCauses) {
        if (!c.description.trim()) throw new Error("Every fishbone cause needs a description.");
      }
      return SgaService.updateRootCause(
        sga.id,
        {
          rootCauseTools,
          otherAnalysisNotes: otherAnalysisNotes.trim() || undefined,
          fishboneCauses: fishboneCauses.map((c) => ({ ...c, description: c.description.trim() })),
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

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="3.8">Root Cause Analysis</SectionLabel>
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Tools Used</p>
          <p className="text-sm text-slate-700">
            {sga.rootCauseTools.length ? sga.rootCauseTools.map((t) => ROOT_CAUSE_TOOL_LABELS[t]).join(", ") : "None selected"}
          </p>
        </div>
        {sga.otherAnalysisNotes && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Other Analysis Notes</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{sga.otherAnalysisNotes}</p>
          </div>
        )}
        {sga.fishboneCauses.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Fishbone Causes</p>
            <div className="space-y-2">
              {FISHBONE_CATEGORIES.map((cat) => {
                const causes = sga.fishboneCauses.filter((f) => f.category === cat.value);
                if (!causes.length) return null;
                return (
                  <div key={cat.value}>
                    <p className="text-xs font-semibold text-blue-600">{cat.label}</p>
                    <ul className="list-disc list-inside text-sm text-slate-700">
                      {causes.map((c) => (
                        <li key={c.id}>{c.description}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="3.8">Root Cause Analysis</SectionLabel>
      <div className="space-y-5">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">Tools used</label>
          <div className="flex flex-wrap gap-2">
            {ROOT_CAUSE_TOOL_OPTIONS.map((t) => {
              const active = rootCauseTools.includes(t.value);
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleTool(t.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    active ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-blue-300"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Other analysis notes <span className="text-xs font-normal text-slate-400">(Why-Why, Pareto, Process Observation, Data Trend, etc.)</span>
          </label>
          <textarea
            rows={3}
            value={otherAnalysisNotes}
            onChange={(e) => setOtherAnalysisNotes(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
          />
        </div>

        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700">Fishbone (5M) causes</p>
          {FISHBONE_CATEGORIES.map((cat) => {
            const rowsForCategory = fishboneCauses
              .map((c, idx) => ({ ...c, idx }))
              .filter((c) => c.category === cat.value);
            return (
              <div key={cat.value} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-blue-600">{cat.label}</p>
                  <button
                    type="button"
                    onClick={() => addCause(cat.value)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add cause
                  </button>
                </div>
                {rowsForCategory.length === 0 ? (
                  <p className="text-xs text-slate-400">No causes added.</p>
                ) : (
                  <div className="space-y-2">
                    {rowsForCategory.map((row) => (
                      <div key={row.idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateCause(row.idx, e.target.value)}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                        />
                        <button type="button" onClick={() => removeCause(row.idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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

export default FishboneSection;
