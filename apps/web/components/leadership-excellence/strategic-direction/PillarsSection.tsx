"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PILLAR_WEIGHTS,
  PILLAR_TOTAL,
  weightsTotal,
  type PillarCode,
  type PillarWeights,
  type SectionStamp,
} from "@/services/leadership-excellence/strategic-direction.service";
import { Guide, SectionCard, SectionMeta } from "./ui";

/**
 * 01.02: the six fixed excellence pillars. Names and codes are fixed; each company sets
 * the weight of each pillar, which later areas use in weighted calculations.
 */
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

/** Weight as typed: whole numbers from 0 to 100; anything else is clamped. */
function parseWeight(raw: string): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

export function PillarGrid({
  weights,
  onChange,
  invalid,
}: {
  /** Shown as a badge; editable when onChange is given. */
  weights?: PillarWeights;
  onChange?: (code: PillarCode, weight: number) => void;
  invalid?: boolean;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {PILLARS.map((p) => (
        <li key={p.code} className="flex flex-col rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold tracking-wide text-secondary-foreground">
              {p.code}
            </span>
            {weights && !onChange && (
              <span className="text-sm font-semibold text-primary tabular-nums">{weights[p.code]}%</span>
            )}
          </div>
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
          {weights && onChange && (
            <label className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3 text-sm font-medium">
              Weight
              <span className="flex items-center gap-1.5">
                <Input
                  id={`weight-${p.code}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[p.code]}
                  aria-invalid={invalid || undefined}
                  onChange={(e) => onChange(p.code, parseWeight(e.target.value))}
                  className="w-20 text-right tabular-nums"
                />
                <span className="text-muted-foreground">%</span>
              </span>
            </label>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PillarsSection({
  number,
  weights,
  onChange,
  editable,
  invalid,
  stamp,
}: {
  number?: string;
  /** Omitted on the employee page before anything is approved: the grid shows without weights. */
  weights?: PillarWeights;
  onChange?: (weights: PillarWeights) => void;
  editable?: boolean;
  invalid?: boolean;
  stamp?: SectionStamp;
}) {
  const total = weights ? weightsTotal(weights) : PILLAR_TOTAL;
  const balanced = total === PILLAR_TOTAL;
  const isDefault = (Object.keys(DEFAULT_PILLAR_WEIGHTS) as PillarCode[]).every(
    (c) => weights?.[c] === DEFAULT_PILLAR_WEIGHTS[c],
  );
  const edit = editable && weights && onChange ? onChange : undefined;
  return (
    <SectionCard
      id="pillars-section"
      number={number}
      label="01.02 · Strategic perspectives"
      title="Our six excellence pillars"
      description="Six fixed perspectives for objective planning in Key Functional Area 3. Set how much each one weighs."
    >
      <Guide title="How to use the six pillars">
        Read what each pillar covers. These are strategic perspectives, not departments or a required number of
        objectives. The six names and codes stay fixed. Give each pillar a weight that reflects how much it matters to
        the organisation; the weights must add up to 100%. Later areas use these weights to calculate performance, and
        in Key Functional Area 3 leadership will select the main pillar for each objective.
      </Guide>
      <PillarGrid
        weights={weights}
        onChange={edit && weights ? (code, w) => edit({ ...weights, [code]: w }) : undefined}
        invalid={invalid || !balanced}
      />
      {weights && (
        <div
          id="pillarWeights"
          tabIndex={-1}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm outline-none"
        >
          <span
            role="status"
            aria-live="polite"
            className={cn("font-medium", balanced ? "text-primary" : "text-destructive")}
          >
            Total {total}% of {PILLAR_TOTAL}%
            {!balanced &&
              (total > PILLAR_TOTAL
                ? ` · remove ${total - PILLAR_TOTAL}% before sending for review`
                : ` · add ${PILLAR_TOTAL - total}% before sending for review`)}
          </span>
          {edit && !isDefault && (
            <Button type="button" size="sm" variant="ghost" onClick={() => edit({ ...DEFAULT_PILLAR_WEIGHTS })}>
              <RotateCcw /> Reset to default weights
            </Button>
          )}
        </div>
      )}
      <SectionMeta stamp={stamp} />
    </SectionCard>
  );
}
