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
          className="h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <h3 aria-live="polite" className="text-sm font-semibold text-slate-800">
          {title}
        </h3>
      </div>
      <dl className="space-y-3 text-sm leading-6 text-slate-500">
        {options.map(({ label, description }) => (
          <div key={label}>
            <dt className="inline font-semibold text-slate-700">{label}: </dt>
            <dd className="inline">{description}</dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="border-t border-slate-100 pt-3 text-sm leading-6 text-slate-500">
          {note}
        </p>
      )}
    </section>
  );
}
