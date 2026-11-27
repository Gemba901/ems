"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService } from "@/services/sga.service";
import { CurrencySelect, HelpText, SectionLabel, getPreferredCurrency } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const ResourcesSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function ResourcesSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [requiredResources, setRequiredResources] = useState(sga.requiredResources ?? "");
  const [expectedBenefitSummary, setExpectedBenefitSummary] = useState(sga.expectedBenefitSummary ?? "");
  const [approximateInvestmentAmount, setApproximateInvestmentAmount] = useState(sga.approximateInvestmentAmount ?? "");
  const [approximateInvestmentCurrency, setApproximateInvestmentCurrency] = useState(
    sga.approximateInvestmentCurrency ?? (access.editable ? getPreferredCurrency() : ""),
  );
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const mutation = useMutation({
    mutationFn: () => {
      const amount = String(approximateInvestmentAmount).trim();
      if (amount && Number.isNaN(Number(amount))) throw new Error("The investment must be a number.");
      if (amount && !approximateInvestmentCurrency) throw new Error("Pick a currency for the investment.");
      return SgaService.updateResources(
        sga.id,
        {
          requiredResources: requiredResources.trim() || undefined,
          expectedBenefitSummary: expectedBenefitSummary.trim() || undefined,
          approximateInvestmentAmount: amount ? Number(amount) : undefined,
          approximateInvestmentCurrency: amount ? approximateInvestmentCurrency : undefined,
        },
        token,
      );
    },
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
    },
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
      <SectionLabel n="2.3">Resources &amp; cost</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Required resources <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            rows={3}
            value={requiredResources}
            disabled={!editable}
            onChange={(e) => setRequiredResources(e.target.value)}
            placeholder="What resources, tools, or budget are needed?"
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Expected benefit summary <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            rows={3}
            value={expectedBenefitSummary}
            disabled={!editable}
            onChange={(e) => setExpectedBenefitSummary(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none disabled:bg-muted disabled:text-muted-foreground"
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Approximate cost <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <HelpText>Leave blank if you don&apos;t know yet or there is no cost.</HelpText>
          <div className="flex gap-2 min-w-0">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={approximateInvestmentAmount}
              disabled={!editable}
              onChange={(e) => setApproximateInvestmentAmount(e.target.value)}
              className="flex-1 min-w-0 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
            />
            <CurrencySelect value={approximateInvestmentCurrency} onChange={setApproximateInvestmentCurrency} disabled={!editable} className="w-32 shrink-0" />
          </div>
        </div>
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

export default ResourcesSection;
