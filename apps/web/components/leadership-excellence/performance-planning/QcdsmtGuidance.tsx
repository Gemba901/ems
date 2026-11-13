import { Info } from "lucide-react";

const dimensions = [
  ["Q", "Quality", "Improve consistency and reduce defects."],
  ["C", "Cost", "Reduce waste and use resources efficiently."],
  ["D", "Delivery", "Improve flow and deliver on time."],
  ["S", "Safety", "Prevent injuries and create safer work."],
  ["M", "Morale", "Support employee wellbeing and involvement."],
  ["T", "Technology", "Improve capability through tools and technology."],
] as const;

export function QcdsmtGuidance() {
  return (
    <aside
      aria-label="QCDSMT alignment guidance"
      className="min-w-0 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-slate-900 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Info size={18} className="shrink-0" aria-hidden="true" />
        <h3 className="text-sm font-semibold">How to use QCDSMT</h3>
      </div>
      <p className="mt-3 text-xs leading-5">
        These tags show which business outcomes an objective supports. They help
        the organisation see where its priorities are focused and identify gaps
        across the plan.
      </p>
      <dl className="mt-4 space-y-3">
        {dimensions.map(([code, name, purpose]) => (
          <div key={code} className="flex items-start gap-3">
            <dt className="flex shrink-0 items-center gap-2 text-xs font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-blue-100 bg-white">
                {code}
              </span>
              <span className="sr-only">{name}</span>
            </dt>
            <dd className="min-w-0 text-xs leading-5">
              <span className="font-semibold">{name}</span>
              <span className="block text-slate-500">{purpose}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 border-t border-blue-100 pt-3 text-xs leading-5">
        Select every outcome this objective directly supports. Multiple tags are
        welcome; these are alignment labels, not scores or performance ratings.
      </p>
      <div className="mt-3 rounded-lg bg-white/80 p-3 text-xs leading-5">
        <p className="font-semibold">Manufacturing example</p>
        <p className="mt-1">
          Reducing production defects to cut scrap and ship on time supports
          Quality (Q), Cost (C) and Delivery (D).
        </p>
      </div>
    </aside>
  );
}
