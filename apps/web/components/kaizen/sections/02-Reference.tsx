"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { KaizenService, KaizenReferenceApplicability } from "@/services/kaizen.service";
import { REFERENCE_APPLICABILITY_LABELS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const APPLICABILITY_OPTIONS: KaizenReferenceApplicability[] = ["APPLICABLE", "NOT_APPLICABLE"];

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
        <SectionLabel n="1.2">Reference</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Applicability</p>
            <p className="text-sm text-foreground">
              {kaizen.referenceApplicability ? REFERENCE_APPLICABILITY_LABELS[kaizen.referenceApplicability] : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reference</p>
            <p className="text-sm text-foreground">{kaizen.referenceValue || "None"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <details
      open={!!(kaizen.referenceValue || kaizen.referenceApplicability)}
      className="group bg-background border border-border rounded-xl p-6 shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
        <span>
          Linked to an alert, audit or other record?{" "}
          <span className="text-xs font-normal text-muted-foreground">(optional)</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 mt-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">Is there a reference?</label>
          <div className="flex flex-wrap gap-1.5">
            {APPLICABILITY_OPTIONS.map((opt) => (
              <Button variant="default"
                key={opt}
                type="button"
                onClick={() => setApplicability(opt)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  applicability === opt
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {REFERENCE_APPLICABILITY_LABELS[opt]}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Reference number or name <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </label>
          <Input
            type="text"
            value={referenceValue}
            onChange={(e) => setReferenceValue(e.target.value)}
            placeholder="e.g. Alert #123, Abnormality ref, audit finding ID..."
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
          />
        </div>
        {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </details>
  );
});

export default ReferenceSection;
