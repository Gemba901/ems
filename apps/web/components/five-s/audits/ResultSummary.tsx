"use client";

import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { formatLevel } from "@/lib/five-s/scoring";
import type { PracticePoints } from "@/services/five-s.service";
import { TargetBadge } from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

/**
 * Points per S, the total, the level and the target, with the calculation written out.
 * `result` is null while checkpoints are still unanswered: no level is shown for a partial audit.
 */
export function ResultSummary({
  points,
  totalPoints,
  result,
  targetLevel,
  unanswered = 0,
  compact,
}: {
  points: PracticePoints;
  totalPoints: number;
  result: { deductionSteps: number; level: number } | null;
  targetLevel: number | null;
  unanswered?: number;
  compact?: boolean;
}) {
  const targetMet = result && targetLevel != null ? result.level >= targetLevel : null;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-5 gap-2 text-center">
        {PRACTICE_ORDER.map((p) => (
          <div key={p} className="rounded-lg border border-border bg-card p-2">
            <dt className="truncate text-[11px] font-medium text-muted-foreground">{PRACTICE_LABELS[p]}</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{points[p]}</dd>
            <dd className="text-[10px] text-muted-foreground">of 20</dd>
          </div>
        ))}
      </dl>
      <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total points</p>
          <p className="text-2xl font-bold tabular-nums">
            {totalPoints}
            <span className="text-sm font-normal text-muted-foreground"> / 100</span>
          </p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">5S level</p>
          {result ? (
            <p className="text-2xl font-bold tabular-nums text-foreground">{formatLevel(result.level)}</p>
          ) : (
            <p className="mt-1 text-sm font-medium italic text-muted-foreground">After all 20 are answered</p>
          )}
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Target</p>
          <p className="text-2xl font-bold tabular-nums">{targetLevel == null ? "—" : formatLevel(targetLevel)}</p>
        </div>
        {!compact && (
          <div className="flex items-center rounded-lg bg-muted p-3">
            {result ? <TargetBadge met={targetMet} /> : <span className="text-sm text-muted-foreground">{unanswered} checkpoint(s) unanswered</span>}
          </div>
        )}
      </div>
      <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">How the level is calculated</p>
        {result ? (
          <p className="mt-1 font-mono text-[13px] leading-6">
            ROUNDUP({totalPoints} ÷ 4) = {result.deductionSteps} step(s)
            <br />
            3.5 − {result.deductionSteps} × 0.1 = <strong>{formatLevel(result.level)}</strong>
            {targetLevel != null && (
              <>
                <br />
                {formatLevel(result.level)} {result.level >= targetLevel ? "≥" : "<"} target {formatLevel(targetLevel)} →{" "}
                {result.level >= targetLevel ? "target met" : "below target"}
              </>
            )}
          </p>
        ) : (
          <p className="mt-1">
            Level = ROUND(3.5 − ROUNDUP(total ÷ 4) × 0.1, 1), applied once to the total. It is calculated when every checkpoint has a selection; a blank is
            never treated as zero.
          </p>
        )}
      </div>
    </div>
  );
}
