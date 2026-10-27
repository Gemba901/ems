import { blockingFindings, extraProfileData } from './onboarding-extra-fields';

const field = (column: number, target: string | null, value: string, heading = 'Column') =>
  ({ column, heading, originalValue: value, value, target });
const phone = (value: string) => (/^\+?\d{9,15}$/.test(value.replace(/\s/g, '')) ? '+254700000000' : null);

describe('optional profile values that can\'t be used', () => {
  it('warn instead of blocking, and leave the profile field empty', () => {
    const { data, findings } = extraProfileData([
      field(33, 'dateOfBirth', '31/02/87'), field(34, 'skillLevel', 'expert'), field(35, 'emergencyContactPhone', 'call mum'),
      field(36, 'dateJoined', '2020-05-01'),
    ], phone, '2026-10-26');
    expect(findings).toHaveLength(3);
    expect(findings.every(f => f.severity === 'warning')).toBe(true);
    expect(findings[0].message).toMatch(/^Date of birth \(column AG\): .*Registration leaves this profile field empty/);
    expect(blockingFindings(findings)).toEqual([]);
    expect(data).toEqual({ dateJoined: '2020-05-01T00:00:00.000Z' });
  });

  it('a future date of birth also only warns', () => {
    const { data, findings } = extraProfileData([field(1, 'dateOfBirth', '2030-01-01')], phone, '2026-10-26');
    expect(findings.map(f => f.severity)).toEqual(['warning']);
    expect(data).toEqual({});
  });

  it('two columns mapped to one field still block', () => {
    const { findings } = extraProfileData([field(1, 'dateOfBirth', '1987-09-22'), field(2, 'dateOfBirth', '1990-01-01')], phone, '2026-10-26');
    expect(blockingFindings(findings)).toHaveLength(1);
    expect(findings[0].severity).toBeUndefined();
  });
});
