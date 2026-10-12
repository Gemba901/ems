import { RecurrenceUnit, TaskFrequency } from 'db';
import {
  addFrequencyInterval,
  isStructuredOccurrenceDate,
  moveOccurrenceToNextOpenDate,
  parseDateOnly,
  parseStructuredRecurrence,
  toIsoDate,
} from './taskSchedule';
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

  it('matches every N days without shifting the anchor', () => {
    const rule = parseStructuredRecurrence({
      startsOn: '2026-10-01',
      unit: RecurrenceUnit.DAY,
      interval: 2,
    });
    expect(isStructuredOccurrenceDate(rule, date('2026-10-03'))).toBe(true);
    expect(isStructuredOccurrenceDate(rule, date('2026-10-04'))).toBe(false);
  });

  it('matches selected weekdays in anchored multi-week periods', () => {
    const rule = parseStructuredRecurrence({
      startsOn: '2026-10-05',
      unit: RecurrenceUnit.WEEK,
      interval: 2,
      weekdays: ['TUE', 'THU', 'FRI'],
    });
    expect(isStructuredOccurrenceDate(rule, date('2026-10-06'))).toBe(true);
    expect(isStructuredOccurrenceDate(rule, date('2026-10-08'))).toBe(true);
    expect(isStructuredOccurrenceDate(rule, date('2026-10-13'))).toBe(false);
    expect(isStructuredOccurrenceDate(rule, date('2026-10-20'))).toBe(true);
  });

  it('clamps monthly rules to the final calendar date', () => {
    const rule = parseStructuredRecurrence({
      startsOn: '2026-01-31',
      unit: RecurrenceUnit.MONTH,
      interval: 1,
      dayOfMonth: 31,
    });
    expect(isStructuredOccurrenceDate(rule, date('2026-02-28'))).toBe(true);
    expect(isStructuredOccurrenceDate(rule, date('2026-03-31'))).toBe(true);
  });

  it('rejects yearly and incomplete structured rules', () => {
    expect(() =>
      parseStructuredRecurrence({
        startsOn: '2026-10-01',
        unit: 'YEAR' as RecurrenceUnit,
        interval: 1,
      }),
    ).toThrow('Only day, week, and month recurrence is supported');
    expect(() =>
      parseStructuredRecurrence({
        startsOn: '2026-10-01',
        unit: RecurrenceUnit.WEEK,
        interval: 1,
      }),
    ).toThrow('Weekly recurrence requires at least one weekday');
  });

  it('moves closed occurrences later without changing their source date', async () => {
    const moved = await moveOccurrenceToNextOpenDate(
      date('2026-10-10'),
      (candidate) => ![0, 6].includes(candidate.getUTCDay()),
    );
    expect(toIsoDate(moved!)).toBe('2026-10-12');
  });
});
