"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileIcon, Loader2, Plus, Trash2, X } from "lucide-react";
import { SgaService, SgaFishboneCategory, SgaRootCauseTool, SgaWhyWhyDecision } from "@/services/sga.service";
import { uploadImage } from "@/services/uploads.service";
import {
  FISHBONE_CATEGORIES,
  FISHBONE_CATEGORY_LABELS,
  ROOT_CAUSE_TOOL_LABELS,
  ROOT_CAUSE_TOOL_OPTIONS,
  SIMPLE_ROOT_CAUSE_TOOLS,
  SectionLabel,
  WHY_WHY_DECISION_LABELS,
  WHY_WHY_DECISION_OPTIONS,
} from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

interface FishboneRow {
  id?: string;
  category: SgaFishboneCategory;
  description: string;
}

interface WhyWhyChainRow {
  id?: string;
  causeToInvestigate: string;
  linked5mCategory: SgaFishboneCategory | "";
  whys: string[];
  evidence: string;
  finalDecision: SgaWhyWhyDecision;
}

const emptyChain = (): WhyWhyChainRow => ({
  causeToInvestigate: "",
  linked5mCategory: "",
  whys: [],
  evidence: "",
  finalDecision: "MORE_INVESTIGATION_REQUIRED",
});

const RootCauseSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function RootCauseSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [rootCauseTools, setRootCauseTools] = useState<SgaRootCauseTool[]>(sga.rootCauseTools ?? []);
  const [otherAnalysisNotes, setOtherAnalysisNotes] = useState(sga.otherAnalysisNotes ?? "");
  const [otherAnalysisFileUrls, setOtherAnalysisFileUrls] = useState<string[]>(sga.otherAnalysisFileUrls ?? []);
  const [uploading, setUploading] = useState(false);
  const [fishboneCauses, setFishboneCauses] = useState<FishboneRow[]>(
    sga.fishboneCauses.map((f) => ({ id: f.id, category: f.category, description: f.description })),
  );
  const [activeFishboneTab, setActiveFishboneTab] = useState<SgaFishboneCategory>("PEOPLE");
  const [whyWhyChains, setWhyWhyChains] = useState<WhyWhyChainRow[]>(
    sga.whyWhyChains.length
      ? sga.whyWhyChains.map((c) => ({
          id: c.id,
          causeToInvestigate: c.causeToInvestigate,
          linked5mCategory: c.linked5mCategory ?? "",
          whys: c.whys,
          evidence: c.evidence ?? "",
          finalDecision: c.finalDecision,
        }))
      : [],
  );
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editable = access.editable;

  const toggleTool = (tool: SgaRootCauseTool) => {
    setRootCauseTools((prev) => {
      const next = prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool];
      if (tool === "WHY_WHY" && !prev.includes(tool) && whyWhyChains.length === 0) {
        setWhyWhyChains([emptyChain()]);
      }
      return next;
    });
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

  const updateChain = (index: number, patch: Partial<WhyWhyChainRow>) => {
    setWhyWhyChains((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const addWhy = (chainIndex: number) => {
    setWhyWhyChains((prev) => prev.map((c, i) => (i === chainIndex ? { ...c, whys: [...c.whys, ""] } : c)));
  };

  const updateWhy = (chainIndex: number, whyIndex: number, value: string) => {
    setWhyWhyChains((prev) =>
      prev.map((c, i) => (i === chainIndex ? { ...c, whys: c.whys.map((w, wi) => (wi === whyIndex ? value : w)) } : c)),
    );
  };

  const removeWhy = (chainIndex: number, whyIndex: number) => {
    setWhyWhyChains((prev) =>
      prev.map((c, i) => (i === chainIndex ? { ...c, whys: c.whys.filter((_, wi) => wi !== whyIndex) } : c)),
    );
  };

  const addChain = () => {
    setWhyWhyChains((prev) => [...prev, emptyChain()]);
  };

  const removeChain = (index: number) => {
    setWhyWhyChains((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      setUploading(true);
      const uploaded = await Promise.all(files.map((file) => uploadImage(file, "sga", token)));
      setOtherAnalysisFileUrls((prev) => [...prev, ...uploaded.map((u) => u.fileUrl)]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setOtherAnalysisFileUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const simpleToolsSelected = SIMPLE_ROOT_CAUSE_TOOLS.filter((t) => rootCauseTools.includes(t));
  const fishboneCausesForTab = fishboneCauses
    .map((c, idx) => ({ ...c, idx }))
    .filter((c) => c.category === activeFishboneTab);

  const mutation = useMutation({
    mutationFn: () => {
      for (const c of fishboneCauses) {
        if (!c.description.trim()) throw new Error("Every fishbone cause needs a description.");
      }
      for (const c of whyWhyChains) {
        if (!c.causeToInvestigate.trim()) throw new Error("Every Why-Why chain needs a cause to investigate.");
      }
      return SgaService.updateRootCause(
        sga.id,
        {
          rootCauseTools,
          otherAnalysisNotes: simpleToolsSelected.length ? otherAnalysisNotes.trim() || undefined : undefined,
          otherAnalysisFileUrls: simpleToolsSelected.length ? otherAnalysisFileUrls : undefined,
          fishboneCauses: fishboneCauses.map((c) => ({ ...c, description: c.description.trim() })),
          whyWhyChains: whyWhyChains.map((c) => ({
            id: c.id,
            causeToInvestigate: c.causeToInvestigate.trim(),
            linked5mCategory: c.linked5mCategory || undefined,
            whys: c.whys,
            evidence: c.evidence.trim() || undefined,
            finalDecision: c.finalDecision,
          })),
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

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="3.3">Root Cause Analysis</SectionLabel>
      <p className="text-xs text-slate-400 mb-4">
        Select one or more tools. Fishbone / 5M and Why-Why can be used together or separately.
      </p>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROOT_CAUSE_TOOL_OPTIONS.map((t) => {
            const checked = rootCauseTools.includes(t.value);
            return (
              <label
                key={t.value}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm text-slate-700 bg-slate-50 ${
                  editable ? "cursor-pointer hover:bg-slate-100" : "cursor-default opacity-80"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!editable}
                  onChange={() => toggleTool(t.value)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                />
                <span>{t.label}</span>
              </label>
            );
          })}
        </div>

        {rootCauseTools.includes("FISHBONE_5M") && (
          <div className="border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-700">Fishbone / 5M Analysis</p>
            <p className="text-xs text-slate-400 mb-3">
              Add any number of possible causes under each category. You do not need to draw a Fishbone.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FISHBONE_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setActiveFishboneTab(cat.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeFishboneTab === cat.value
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-blue-600">{FISHBONE_CATEGORY_LABELS[activeFishboneTab]}</p>
                {editable && (
                  <button
                    type="button"
                    onClick={() => addCause(activeFishboneTab)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Possible Cause
                  </button>
                )}
              </div>
              {fishboneCausesForTab.length === 0 ? (
                <p className="text-xs text-slate-400">No causes added.</p>
              ) : (
                <div className="space-y-2">
                  {fishboneCausesForTab.map((row) => (
                    <div key={row.idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.description}
                        disabled={!editable}
                        onChange={(e) => updateCause(row.idx, e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                      {editable && (
                        <button type="button" onClick={() => removeCause(row.idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {rootCauseTools.includes("WHY_WHY") && (
          <div className="border-t border-slate-100 pt-5 space-y-4">
            <p className="text-sm font-semibold text-slate-700">Why-Why Analysis</p>
            {whyWhyChains.map((chain, chainIndex) => (
              <div key={chainIndex} className="border border-slate-200 rounded-lg p-4 space-y-3">
                {whyWhyChains.length > 1 && editable && (
                  <div className="flex justify-end">
                    <button type="button" onClick={() => removeChain(chainIndex)} className="text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Cause to investigate</label>
                  <input
                    type="text"
                    list={`fishbone-causes-${chainIndex}`}
                    value={chain.causeToInvestigate}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { causeToInvestigate: e.target.value })}
                    placeholder="Select a 5M cause or enter another cause"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <datalist id={`fishbone-causes-${chainIndex}`}>
                    {fishboneCauses.map((c, i) => (
                      <option key={i} value={c.description} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Linked 5M category</label>
                  <select
                    value={chain.linked5mCategory}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { linked5mCategory: e.target.value as SgaFishboneCategory })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="">Not Linked / Standalone Why-Why</option>
                    {FISHBONE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                {chain.whys.map((why, whyIndex) => (
                  <div key={whyIndex} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={why}
                      disabled={!editable}
                      onChange={(e) => updateWhy(chainIndex, whyIndex, e.target.value)}
                      placeholder={`Why #${whyIndex + 1}`}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    {editable && (
                      <button type="button" onClick={() => removeWhy(chainIndex, whyIndex)} className="text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {editable && (
                  <button
                    type="button"
                    onClick={() => addWhy(chainIndex)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ask Why
                  </button>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Evidence / how was it checked?</label>
                  <textarea
                    rows={2}
                    value={chain.evidence}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { evidence: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Final decision</label>
                  <select
                    value={chain.finalDecision}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { finalDecision: e.target.value as SgaWhyWhyDecision })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    {WHY_WHY_DECISION_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {editable && (
              <button
                type="button"
                onClick={addChain}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Start Another Why-Why Chain
              </button>
            )}
          </div>
        )}

        {simpleToolsSelected.length > 0 && (
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              {simpleToolsSelected.map((t) => ROOT_CAUSE_TOOL_LABELS[t]).join(" + ")}
            </p>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Analysis details / findings</label>
              <textarea
                rows={3}
                value={otherAnalysisNotes}
                disabled={!editable}
                onChange={(e) => setOtherAnalysisNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Upload data, chart or evidence</label>
              {otherAnalysisFileUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {otherAnalysisFileUrls.map((url, i) => (
                    <div key={url} className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600">
                      <FileIcon className="h-3.5 w-3.5 text-slate-400" />
                      File {i + 1}
                      {editable && (
                        <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {editable && (
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  disabled={uploading}
                  onChange={handleFileChange}
                  className="text-xs text-slate-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-600 file:text-xs"
                />
              )}
              {uploading && (
                <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
                </p>
              )}
            </div>
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

export default RootCauseSection;
