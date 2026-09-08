import { TaskFrequency } from 'db';
import { addFrequencyInterval, parseDateOnly, toIsoDate } from './taskSchedule';
const date = (value: string) => new Date(`${value}T00:00:00Z`);

describe('DWMS recurrence dates', () => {
  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    'not-a-date',
  ])('rejects invalid date %s', (value) => {
    expect(parseDateOnly(value)).toBeNull();
  });
  it('accepts leap day', () =>
    expect(parseDateOnly('2028-02-29')).toEqual(date('2028-02-29')));
  it.each([
    ['2026-01-31', TaskFrequency.MONTHLY, '2026-02-28'],
    ['2028-01-31', TaskFrequency.MONTHLY, '2028-02-29'],
    ['2026-01-31', TaskFrequency.QUARTERLY, '2026-04-30'],
    ['2028-02-29', TaskFrequency.YEARLY, '2029-02-28'],
    ['2026-12-31', TaskFrequency.DAILY, '2027-01-01'],
    ['2026-12-28', TaskFrequency.WEEKLY, '2027-01-04'],
  ])('advances %s (%s) to %s without overflow', (from, frequency, to) => {
    expect(
      toIsoDate(addFrequencyInterval(date(from), frequency as TaskFrequency)),
    ).toBe(to);
  });
});
