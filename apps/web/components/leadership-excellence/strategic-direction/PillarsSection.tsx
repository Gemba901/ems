"use client";

import { ChevronDown } from "lucide-react";
import { Guide, SectionCard } from "./ui";

/** 01.02: the six fixed excellence pillars. Fixed reference data; Area 03 picks one per objective. */
export const PILLARS = [
  {
    code: "LEX",
    name: "Leadership Excellence",
    tag: "Direction · Strategy · Performance",
    text: "Clear direction, responsible leadership and consistent follow-through. This pillar helps leaders agree on what matters, explain expectations and review progress so the organisation works towards shared outcomes.",
  },
  {
    code: "PEX",
    name: "People Excellence",
    tag: "Capability · Engagement · Development",
    text: "Capable, involved and supported people. This pillar covers role clarity, skills, teamwork, engagement and development so employees can contribute confidently and improve their work.",
  },
  {
    code: "OPX",
    name: "Operational Excellence",
    tag: "People · Process · Technology",
    text: "Reliable work through better people, processes and technology. This pillar covers quality, productivity, waste reduction, equipment performance, standards and continuous improvement.",
  },
  {
    code: "CMX",
    name: "Customer & Market Excellence",
    tag: "Customer Value · Competitiveness · Growth",
    text: "Understanding customers and creating value they recognise. This pillar covers customer experience, products and services, market knowledge, brand, sales and competitiveness.",
  },
  {
    code: "SGEX",
    name: "Sustainability & Governance Excellence",
    tag: "Standards · Risk · Responsibility",
    text: "Running the organisation responsibly, safely and with clear accountability. This pillar covers governance, risk, compliance, environmental responsibility and practices that support the organisation's long-term future.",
  },
  {
    code: "FPEX",
    name: "Financial Performance Excellence",
    tag: "Profitability · Financial Health · Value",
    text: "Healthy financial results and sound use of resources. This pillar covers profitability, cash flow, working capital, budgets, investment decisions and long-term financial strength.",
  },
] as const;

export function PillarGrid() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PILLARS.map((p) => (
        <li key={p.code} className="rounded-lg border border-border bg-card p-4">
          <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold tracking-wide text-secondary-foreground">
            {p.code}
          </span>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{p.name}</h3>
          <p className="text-xs text-muted-foreground">{p.tag}</p>
          <details className="group mt-3">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Know more</span>
              <span className="hidden group-open:inline">Show less</span>
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">{p.text}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

export function PillarsSection({ number }: { number?: string }) {
  return (
    <SectionCard
      id="pillars-section"
      number={number}
      label="01.02 · Fixed strategic perspectives"
      title="Our six excellence pillars"
      description="Six fixed perspectives for objective planning in Key Functional Area 3. Select Know more to understand each one."
    >
      <Guide title="How to use the six pillars">
        Read what each pillar covers. These are strategic perspectives, not departments or a required number of
        objectives. The six names and codes stay fixed. In Key Functional Area 3, leadership will select the main pillar
        for each objective.
      </Guide>
      <PillarGrid />
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Reference only. No additional pillars need to be entered here.
      </p>
    </SectionCard>
  );
}
