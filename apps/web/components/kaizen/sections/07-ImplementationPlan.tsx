"use client";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { KaizenService } from "@/services/kaizen.service";
import { CurrencySelect, getPreferredCurrency, HelpText, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const ImplementationPlanSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function ImplementationPlanSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [requiredMaterials, setRequiredMaterials] = useState(kaizen.requiredMaterials ?? "");
  const [estimatedCost, setEstimatedCost] = useState(kaizen.estimatedCost ?? "");
  const [estimatedCostCurrency, setEstimatedCostCurrency] = useState(() => kaizen.estimatedCostCurrency ?? getPreferredCurrency());
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (estimatedCost && !estimatedCostCurrency) throw new Error("Select a currency for the estimated cost.");
      return KaizenService.updateImplementationPlan(
        kaizen.id,
        {
          requiredMaterials: requiredMaterials.trim() || undefined,
          estimatedCost: estimatedCost ? String(estimatedCost) : undefined,
          estimatedCostCurrency: estimatedCost ? estimatedCostCurrency : undefined,
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

  if (!access.editable) {
    return (
      <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.7">Required Materials &amp; Estimated Cost</SectionLabel>
        <p className="text-sm text-foreground whitespace-pre-wrap mb-3">{kaizen.requiredMaterials || "Not set."}</p>
        {kaizen.estimatedCost && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Estimated Cost</p>
            <p className="text-sm text-foreground">
              {kaizen.estimatedCostCurrency} {kaizen.estimatedCost}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.7">What you need</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">What do you need to do it?</label>
          <HelpText>Materials, tools or help. Write &quot;Nothing&quot; if you need nothing.</HelpText>
          <Textarea
            rows={3}
            value={requiredMaterials}
            onChange={(e) => setRequiredMaterials(e.target.value)}
            placeholder="What materials, tools, or resources are needed to implement this kaizen?"
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Estimated cost <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <HelpText>Leave blank if it costs nothing or you don&apos;t know yet.</HelpText>
          <div className="flex gap-2 min-w-0">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              className="flex-1 min-w-0 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
            <CurrencySelect value={estimatedCostCurrency} onChange={setEstimatedCostCurrency} className="w-32 shrink-0" />
          </div>
        </div>
        {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default ImplementationPlanSection;
