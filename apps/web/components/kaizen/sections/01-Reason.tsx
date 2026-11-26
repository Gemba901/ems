"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { KaizenService, KaizenTrigger } from "@/services/kaizen.service";
import { HelpText, KAIZEN_TOP_TRIGGERS, KAIZEN_TRIGGERS, KAIZEN_TRIGGER_GROUPS, SectionLabel } from "@/components/kaizen/kaizen-ui";
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
        { trigger: trigger || undefined, triggerOther: trigger === "OTHER" ? triggerOther.trim() || undefined : undefined },
        token,
      ),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      // Drafts may be saved half-filled; submit checks what is still missing.
      const other = triggerOther.trim();
      if (trigger === "OTHER" && other && (other.length < EXPLANATION_MIN || other.length > EXPLANATION_MAX)) {
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
      <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.1">Reason</SectionLabel>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Why was this Daily Kaizen started?
            </p>
            <p className="text-sm text-foreground">{trigLabel?.label ?? kaizen.trigger ?? "Not set"}</p>
          </div>
          {kaizen.trigger === "OTHER" && kaizen.triggerOther && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Explanation</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{kaizen.triggerOther}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.1">Reason</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Why did you start this kaizen?
          </label>
          <HelpText>Pick the closest match. Choose &quot;Other&quot; if none fit.</HelpText>
          <NativeSelect
            value={trigger}
            onChange={(e) => {
              setTrigger(e.target.value as KaizenTrigger);
              setError(null);
            }}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
          >
            <option value="">Select a reason...</option>
            {KAIZEN_TOP_TRIGGERS.map((value) => (
              <option key={value} value={value}>
                {KAIZEN_TRIGGERS.find((t) => t.value === value)?.label ?? value}
              </option>
            ))}
            {KAIZEN_TRIGGER_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.triggers.map((value) => (
                  <option key={value} value={value}>
                    {KAIZEN_TRIGGERS.find((t) => t.value === value)?.label ?? value}
                  </option>
                ))}
              </optgroup>
            ))}
          </NativeSelect>
        </div>

        {trigger === "OTHER" && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-foreground">
                Please explain
              </label>
              <span className={`text-xs ${triggerOther.length > EXPLANATION_MAX ? "text-danger" : "text-muted-foreground"}`}>
                {triggerOther.length}/{EXPLANATION_MAX}
              </span>
            </div>
            <Textarea
              rows={4}
              value={triggerOther}
              onChange={(e) => {
                setTriggerOther(e.target.value);
                setError(null);
              }}
              placeholder="Describe why this Daily Kaizen was started..."
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all resize-none"
            />
          </div>
        )}

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

export default ReasonSection;
