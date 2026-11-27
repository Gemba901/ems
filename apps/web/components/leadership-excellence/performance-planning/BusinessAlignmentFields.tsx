"use client";

import { control, Field } from "./PlanningUi";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export const BUSINESS_ALIGNMENT_OPTIONS = [
  ["Q", "Q · Quality"],
  ["C", "C · Cost"],
  ["D", "D · Delivery"],
  ["S", "S · Safety"],
  ["M", "M · Morale"],
  ["T", "T · Technology"],
  ["OTHER", "Business focus"],
] as const;

export function BusinessAlignmentFields({
  values,
  businessFocus,
  onChange,
  onBusinessFocusChange,
}: {
  values: string[];
  businessFocus: string;
  onChange: (values: string[]) => void;
  onBusinessFocusChange: (value: string) => void;
}) {
  return (
    <fieldset className="col-span-full min-w-0">
      <legend className="text-sm font-medium text-foreground">
        QCDSMT alignment
      </legend>
      <p className="mt-1 text-xs text-muted-foreground">
        Select all the areas that apply. Add Business focus for a specific
        business outcome.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BUSINESS_ALIGNMENT_OPTIONS.map(([code, label]) => (
          <label
            key={code}
            className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm ${values.includes(code) ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-foreground"}`}
          >
            <Checkbox
              className="shrink-0"
              checked={values.includes(code)}
              onCheckedChange={(checked) => onChange(
                  BUSINESS_ALIGNMENT_OPTIONS.map(([value]) => value).filter(
                    (value) =>
                      value === code
                        ? checked
                        : values.includes(value),
                  ),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {values.includes("OTHER") && (
        <div className="mt-4">
          <Field label="Business focus details">
            <Input
              className={control}
              value={businessFocus}
              maxLength={4000}
              placeholder="e.g. Cash availability or market growth"
              onChange={(event) => onBusinessFocusChange(event.target.value)}
            />
          </Field>
        </div>
      )}
    </fieldset>
  );
}
