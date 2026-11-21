import { levelTenthsFromTotal, scoreAudit, unansweredCheckpoints } from './five-s-scoring';
import { PRODUCTION_SHOPFLOOR_CHECKPOINTS } from './five-s-template';

// Mirrors Excel: =ROUND(3.5-(ROUNDUP(AC28/4,0)*0.1),1)
function excelLevel(total: number): number {
    return Math.round((3.5 - Math.ceil(total / 4) * 0.1) * 10) / 10;
}

function countsFrom(values: number[]): Map<number, number> {
    return new Map(values.map((v, i) => [i + 1, v]));
}

describe('5S scoring', () => {
    it.each([
        [0, 35],
        [1, 34], [4, 34],
        [5, 33], [8, 33],
        [17, 30], [20, 30],
        [21, 29], [24, 29],
        [97, 10], [100, 10],
    ])('total %i gives level tenths %i', (total, tenths) => {
        expect(levelTenthsFromTotal(total)).toBe(tenths);
    });

    it('matches the workbook formula for every possible total', () => {
        for (let total = 0; total <= 100; total++) {
            expect(levelTenthsFromTotal(total) / 10).toBe(excelLevel(total));
        }
    });

    it('applies the formula once to the overall total, not per S', () => {
        // One point in each S: total 5 -> 3.3. Per-S levels would each be 3.4 and average to 3.4.
        const counts = countsFrom([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
        const result = scoreAudit(PRODUCTION_SHOPFLOOR_CHECKPOINTS, counts);
        expect(result.pointsByPractice).toEqual({ SORT: 1, SET_IN_ORDER: 1, SHINE: 1, STANDARDIZE: 1, SUSTAIN: 1 });
        expect(result.totalPoints).toBe(5);
        expect(result.deductionSteps).toBe(2);
        expect(result.levelTenths).toBe(33);
    });

    it('counts 5+ as five points and caps each S at 20', () => {
        const result = scoreAudit(PRODUCTION_SHOPFLOOR_CHECKPOINTS, countsFrom(Array(20).fill(5)));
        expect(result.pointsByPractice.SORT).toBe(20);
        expect(result.totalPoints).toBe(100);
        expect(result.levelTenths).toBe(10);
    });

    it('treats unanswered checkpoints as missing, never as zero', () => {
        const counts = new Map<number, number | null>(countsFrom(Array(20).fill(0)));
        counts.set(7, null);
        counts.delete(12);
        expect(unansweredCheckpoints(PRODUCTION_SHOPFLOOR_CHECKPOINTS, counts)).toEqual([7, 12]);
        expect(() => scoreAudit(PRODUCTION_SHOPFLOOR_CHECKPOINTS, counts)).toThrow('Checkpoints not answered: 7, 12');
    });

    it('has four checkpoints under each S', () => {
        const perPractice = new Map<string, number>();
        for (const c of PRODUCTION_SHOPFLOOR_CHECKPOINTS) perPractice.set(c.practice, (perPractice.get(c.practice) ?? 0) + 1);
        expect([...perPractice.values()]).toEqual([4, 4, 4, 4, 4]);
        expect(PRODUCTION_SHOPFLOOR_CHECKPOINTS.map((c) => c.no)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });
});
