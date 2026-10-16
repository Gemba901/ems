import { FiveSPractice } from 'db';
import { FiveSCheckpoint, PRACTICE_ORDER } from './five-s-template';

// Abnormality-based 5S scoring. Lower points mean better conditions.
//
// Each checkpoint records 0, 1, 2, 3, 4 or 5+ problem locations; 5+ contributes 5 points.
// Each S is the sum of its four checkpoints (0-20). The audit total is the sum of all 20 (0-100).
// The overall level applies the workbook formula once, to the total:
//   =ROUND(3.5-(ROUNDUP(AC28/4,0)*0.1),1)
// Levels are integer tenths (35 = 3.5) so the arithmetic is exact.

export const MAX_LOCATION_COUNT = 5;
export const TOP_LEVEL_TENTHS = 35;
export const MIN_LEVEL_TENTHS = 10;

export type PracticePoints = Record<FiveSPractice, number>;

export type FiveSResult = {
    pointsByPractice: PracticePoints;
    totalPoints: number;
    // ROUNDUP(total / 4, 0): the number of 0.1 steps deducted from 3.5.
    deductionSteps: number;
    levelTenths: number;
};

export function isLocationCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_LOCATION_COUNT;
}

export function levelTenthsFromTotal(totalPoints: number): number {
    if (!Number.isInteger(totalPoints) || totalPoints < 0 || totalPoints > 100) {
        throw new Error(`Total abnormality points must be a whole number from 0 to 100, got ${totalPoints}`);
    }
    return TOP_LEVEL_TENTHS - Math.ceil(totalPoints / 4);
}

export function formatLevel(tenths: number): string {
    return (tenths / 10).toFixed(1);
}

export function emptyPracticePoints(): PracticePoints {
    return { SORT: 0, SET_IN_ORDER: 0, SHINE: 0, STANDARDIZE: 0, SUSTAIN: 0 };
}

// Checkpoints without a count are reported, never counted as zero.
export function unansweredCheckpoints(
    checkpoints: readonly FiveSCheckpoint[],
    counts: ReadonlyMap<number, number | null | undefined>,
): number[] {
    return checkpoints.filter((c) => !isLocationCount(counts.get(c.no))).map((c) => c.no);
}

// Only valid for a fully answered checksheet; callers must check unansweredCheckpoints first.
export function scoreAudit(
    checkpoints: readonly FiveSCheckpoint[],
    counts: ReadonlyMap<number, number | null | undefined>,
): FiveSResult {
    const missing = unansweredCheckpoints(checkpoints, counts);
    if (missing.length > 0) throw new Error(`Checkpoints not answered: ${missing.join(', ')}`);

    const pointsByPractice = emptyPracticePoints();
    for (const checkpoint of checkpoints) {
        pointsByPractice[checkpoint.practice] += counts.get(checkpoint.no) as number;
    }
    const totalPoints = PRACTICE_ORDER.reduce((sum, practice) => sum + pointsByPractice[practice], 0);
    const deductionSteps = Math.ceil(totalPoints / 4);
    return { pointsByPractice, totalPoints, deductionSteps, levelTenths: TOP_LEVEL_TENTHS - deductionSteps };
}
