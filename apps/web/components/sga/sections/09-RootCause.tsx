"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"),
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
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="3.3">Root Cause Analysis</SectionLabel>
      <p className="text-xs text-muted-foreground mb-4">
        Select one or more tools. Fishbone / 5M and Why-Why can be used together or separately.
      </p>
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ROOT_CAUSE_TOOL_OPTIONS.map((t) => {
            const checked = rootCauseTools.includes(t.value);
            return (
              <label
                key={t.value}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm text-foreground bg-muted ${
                  editable ? "cursor-pointer hover:bg-muted" : "cursor-default opacity-80"
                }`}
              >
                <Input
                  type="checkbox"
                  checked={checked}
                  disabled={!editable}
                  onChange={() => toggleTool(t.value)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-ring/20"
                />
                <span>{t.label}</span>
              </label>
            );
          })}
        </div>

        {rootCauseTools.includes("FISHBONE_5M") && (
          <div className="border-t border-border pt-5">
            <p className="text-sm font-semibold text-foreground">Fishbone / 5M Analysis</p>
            <p className="text-xs text-muted-foreground mb-3">
              Add any number of possible causes under each category. You do not need to draw a Fishbone.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FISHBONE_CATEGORIES.map((cat) => (
                <Button variant="ghost"
                  key={cat.value}
                  type="button"
                  onClick={() => setActiveFishboneTab(cat.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeFishboneTab === cat.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-primary">{FISHBONE_CATEGORY_LABELS[activeFishboneTab]}</p>
                {editable && (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => addCause(activeFishboneTab)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Possible Cause
                  </Button>
                )}
              </div>
              {fishboneCausesForTab.length === 0 ? (
                <p className="text-xs text-muted-foreground">No causes added.</p>
              ) : (
                <div className="space-y-2">
                  {fishboneCausesForTab.map((row) => (
                    <div key={row.idx} className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={row.description}
                        disabled={!editable}
                        onChange={(e) => updateCause(row.idx, e.target.value)}
                        className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                      />
                      {editable && (
                        <Button variant="ghost" type="button" onClick={() => removeCause(row.idx)} className="text-muted-foreground hover:text-danger transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {rootCauseTools.includes("WHY_WHY") && (
          <div className="border-t border-border pt-5 space-y-4">
            <p className="text-sm font-semibold text-foreground">Why-Why Analysis</p>
            {whyWhyChains.map((chain, chainIndex) => (
              <div key={chainIndex} className="border border-border rounded-lg p-4 space-y-3">
                {whyWhyChains.length > 1 && editable && (
                  <div className="flex justify-end">
                    <Button variant="ghost" type="button" onClick={() => removeChain(chainIndex)} className="text-muted-foreground hover:text-danger transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Cause to investigate</label>
                  <Input
                    type="text"
                    list={`fishbone-causes-${chainIndex}`}
                    value={chain.causeToInvestigate}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { causeToInvestigate: e.target.value })}
                    placeholder="Select a 5M cause or enter another cause"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  />
                  <datalist id={`fishbone-causes-${chainIndex}`}>
                    {fishboneCauses.map((c, i) => (
                      <option key={i} value={c.description} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Linked 5M category</label>
                  <NativeSelect
                    value={chain.linked5mCategory}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { linked5mCategory: e.target.value as SgaFishboneCategory })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <option value="">Not Linked / Standalone Why-Why</option>
                    {FISHBONE_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {chain.whys.map((why, whyIndex) => (
                  <div key={whyIndex} className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={why}
                      disabled={!editable}
                      onChange={(e) => updateWhy(chainIndex, whyIndex, e.target.value)}
                      placeholder={`Why #${whyIndex + 1}`}
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                    />
                    {editable && (
                      <Button variant="ghost" type="button" onClick={() => removeWhy(chainIndex, whyIndex)} className="text-muted-foreground hover:text-danger transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button variant="ghost"
                    type="button"
                    onClick={() => addWhy(chainIndex)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> Ask Why
                  </Button>
                )}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Evidence / how was it checked?</label>
                  <Textarea
                    rows={2}
                    value={chain.evidence}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { evidence: e.target.value })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Final decision</label>
                  <NativeSelect
                    value={chain.finalDecision}
                    disabled={!editable}
                    onChange={(e) => updateChain(chainIndex, { finalDecision: e.target.value as SgaWhyWhyDecision })}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {WHY_WHY_DECISION_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            ))}
            {editable && (
              <Button variant="ghost"
                type="button"
                onClick={addChain}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Start Another Why-Why Chain
              </Button>
            )}
          </div>
        )}

        {simpleToolsSelected.length > 0 && (
          <div className="border-t border-border pt-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">
              {simpleToolsSelected.map((t) => ROOT_CAUSE_TOOL_LABELS[t]).join(" + ")}
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Analysis details / findings</label>
              <Textarea
                rows={3}
                value={otherAnalysisNotes}
                disabled={!editable}
                onChange={(e) => setOtherAnalysisNotes(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:bg-muted disabled:text-muted-foreground resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Upload data, chart or evidence</label>
              {otherAnalysisFileUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {otherAnalysisFileUrls.map((url, i) => (
                    <div key={url} className="flex items-center gap-1.5 border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground">
                      <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      File {i + 1}
                      {editable && (
                        <Button variant="ghost" type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-danger transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {editable && (
                <Input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  disabled={uploading}
                  onChange={handleFileChange}
                  className="text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-muted file:text-muted-foreground file:text-xs"
                />
              )}
              {uploading && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default RootCauseSection;
