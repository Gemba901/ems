import type { Practice, PracticePoints } from "@/services/five-s.service";
import { PRACTICE_ORDER, type Checkpoint } from "./template";

// Same rules as apps/api/src/five-s/five-s-scoring.ts. The server recalculates on submit;
// this copy only drives the live preview while the audit is being filled in.
//
// Each checkpoint records 0, 1, 2, 3, 4 or 5+ problem locations; 5+ counts as 5 points.
// Each S = sum of its four checkpoints (0-20). Total = sum of all 20 (0-100).
// Level = ROUND(3.5 - ROUNDUP(total / 4, 0) x 0.1, 1), applied once to the total.

export const LOCATION_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
export const TOP_LEVEL = 3.5;

export function countLabel(value: number): string {
  return value >= 5 ? "5+" : String(value);
}

export function emptyPoints(): PracticePoints {
  return { SORT: 0, SET_IN_ORDER: 0, SHINE: 0, STANDARDIZE: 0, SUSTAIN: 0 };
}

// Integer tenths keep the arithmetic exact (35 - steps), then convert once for display.
export function levelFromTotal(total: number): { deductionSteps: number; level: number } {
  const deductionSteps = Math.ceil(total / 4);
  return { deductionSteps, level: (35 - deductionSteps) / 10 };
}

export function formatLevel(level: number | null | undefined): string {
  return level == null ? "Not assessed" : level.toFixed(1);
}

export type LivePreview = {
  points: PracticePoints;
  answered: number;
  total: number;
  unanswered: number[];
  totalPoints: number;
  // Only once every checkpoint is answered; a blank is never treated as zero.
  result: { deductionSteps: number; level: number } | null;
};

export function previewScore(checkpoints: readonly Checkpoint[], counts: ReadonlyMap<number, number | null>): LivePreview {
  const points = emptyPoints();
  const unanswered: number[] = [];
  for (const c of checkpoints) {
    const value = counts.get(c.no);
    if (value == null) unanswered.push(c.no);
    else points[c.practice] += value;
  }
  const totalPoints = PRACTICE_ORDER.reduce((sum, p) => sum + points[p], 0);
  return {
    points,
    answered: checkpoints.length - unanswered.length,
    total: checkpoints.length,
    unanswered,
    totalPoints,
    result: unanswered.length === 0 ? levelFromTotal(totalPoints) : null,
  };
}

export function practiceOf(checkpoints: readonly Checkpoint[], practice: Practice) {
  return checkpoints.filter((c) => c.practice === practice);
}

// The counting instructions from the 20 Keys checksheet, shown on the audit screen and in the guide.
export const COUNTING_RULES: string[] = [
  "Assess normal working conditions.",
  "Agree on the audit boundary before starting.",
  "Count problem locations rather than individual items.",
  "Several unwanted items on the same rack count as one problem location.",
  "Count each physical problem location only once under its most relevant checkpoint.",
  "Discuss findings with the auditee.",
  "Use results to prioritise improvement.",
];

// How a selection is recorded; these follow from the checksheet rules above.
export const SELECTION_RULES: string[] = [
  "Choose exactly one of 0, 1, 2, 3, 4 or 5+ problem locations for every checkpoint.",
  "5+ means five or more problem locations and counts as 5 points.",
  "A checkpoint left blank is unanswered, never zero. There is no N/A option.",
];
