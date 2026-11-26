import React from "react";
import { Lightbulb } from "lucide-react";

export type FormHelpContent = {
  title: string;
  options: Array<{ label: string; description: string }>;
  note?: string;
};

export default function FormHelp({ title, options, note }: FormHelpContent) {
  return (
    <section aria-label="Help for the current stage" className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb
          className="h-4 w-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <h3 aria-live="polite" className="text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>
      <dl className="space-y-3 text-sm leading-6 text-muted-foreground">
        {options.map(({ label, description }) => (
          <div key={label}>
            <dt className="inline font-semibold text-foreground">{label}: </dt>
            <dd className="inline">{description}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
}
