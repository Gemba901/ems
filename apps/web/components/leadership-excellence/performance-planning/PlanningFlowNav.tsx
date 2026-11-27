"use client";

import Link from "next/link";

export const planningStages = [
  ["findings", "SWOT findings", "Evidence & impact", "swot-findings"],
  ["review", "Review & decide", "Choose the response", "review-findings"],
  ["company", "Company objectives", "Priorities & weights", "objectives"],
  [
    "department",
    "Department goals",
    "Linked to company objectives",
    "department-plans",
  ],
  [
    "personal",
    "Individual plans",
    "Linked to department goals",
    "team-individual-plans",
  ],
  ["results", "Results & review", "Verify & sustain", "results"],
] as const;

export function PlanningFlowNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Performance planning steps"
      className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-2 xl:grid-cols-6"
    >
      {planningStages.map(([key, label, subtitle, path], index) => (
        <Link
          key={key}
          href={`/leadership-excellence/performance-planning/${path}`}
          aria-current={active === key ? "step" : undefined}
          className={`flex min-w-0 items-center gap-2 rounded-lg p-3 transition-colors ${active === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
        >
          <span
            className={`grid size-7 shrink-0 place-items-center rounded-md border text-xs ${active === key ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {index + 1}
          </span>
          <span className="min-w-0">
            <strong className="block text-xs font-semibold">{label}</strong>
            <span className="mt-1 hidden text-[10px] sm:block">{subtitle}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}
