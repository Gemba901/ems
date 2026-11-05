import { readExtraFields, reviseExtraFields, extraProfileData, MAX_EXTRA_FIELDS } from './onboarding-extra-fields';
const field = (changes: Record<string, unknown> = {}) => ({column: 30, heading: 'Notes', originalValue: 'original', value: 'current', target: null, ...changes});
const phone = (value: string) => value === '0712345678' ? '+254712345678' : null;

describe('imported additional information', () => {
  it('keeps identical headings separate by column, including hostile-looking headings', () => {
    const fields = readExtraFields([field({column: 32, heading: '__proto__'}), field({column: 31}), field()]);
    expect(fields.map(f => f.column)).toEqual([30, 31, 32]);
    expect(({} as any).polluted).toBeUndefined();
  });
  it('keeps zero, false, Unicode and original whitespace as text', () => {
    const f = field({heading: ' Maelezo ', originalValue: '  zéro  ', value: '0'});
    expect(readExtraFields([f])).toEqual([f]);
  });
  it.each([null, undefined])('old records without extras remain valid (%s)', value => {
    expect(extraProfileData(value, phone)).toEqual({data: {}, findings: []});
  });
  it.each(['organizationId', 'userId', 'reportingManagerId', 'beesAccessLevel', 'canBeLeader', '__proto__'])('cannot map into protected field %s', target => {
    expect(() => readExtraFields([field({target})])).toThrow('supported profile');
  });
  it('copies only documented properties', () => {
    expect(readExtraFields([{...field(), status: 'REGISTERED', employeeId: 'forged'}])[0]).not.toHaveProperty('status');
  });
  it('validates column uniqueness and bounded shape', () => {
    for (const value of [{}, [null], [field({column: 0})], [field({column: 1.5})], [field(), field()],
      [field({value: {nested: true}})], [field({heading: 'x'.repeat(201)})], [field({value: 'x'.repeat(4001)})],
      [field({value: '\u0000'})], Array.from({length: MAX_EXTRA_FIELDS + 1}, (_, i) => field({column: i + 1}))]) {
      expect(() => readExtraFields(value)).toThrow();
    }
  });
  it('bounds UTF-8 bytes, not just the number of characters', () => {
    expect(() => readExtraFields(Array.from({length: 8}, (_, i) => field({column: i + 1, value: '界'.repeat(2500)})))).toThrow('48 KB');
  });
  it('kept extras do not become fields or validation problems', () => {
    expect(extraProfileData([field({value: '31/99/0000'})], phone)).toEqual({data: {}, findings: []});
  });
  it('maps supported text, date, boolean, enum and phone values', () => {
    const fields = [field({column: 1, target: 'dateOfBirth', value: '1990-02-28'}), field({column: 2, target: 'trainingNeeded', value: 'No'}),
      field({column: 3, target: 'skillLevel', value: 'Level 3'}), field({column: 4, target: 'emergencyContactPhone', value: '0712345678'}),
      field({column: 5, target: 'grade', value: ' G4 '})];
    expect(extraProfileData(fields, phone, '2026-10-19')).toEqual({data: {dateOfBirth: '1990-02-28T00:00:00.000Z', trainingNeeded: false,
      skillLevel: 'LEVEL_3', emergencyContactPhone: '+254712345678', grade: 'G4'}, findings: []});
  });
  it.each(['2026-02-30', '31/01/1990', '2000-13-01', '1899-01-01', 'tomorrow', '2027-01-01'])('flags invalid/ambiguous/future birth date %s', value => {
    expect(extraProfileData([field({target: 'dateOfBirth', value})], phone, '2026-10-19').findings).toHaveLength(1);
  });
  it('allows real leap days and future joining dates', () => {
    expect(extraProfileData([field({target: 'dateOfBirth', value: '2000-02-29'})], phone).findings).toEqual([]);
    expect(extraProfileData([field({target: 'dateJoined', value: '2030-01-01'})], phone).findings).toEqual([]);
  });
  it.each([['trainingNeeded', 'maybe'], ['skillLevel', 'LEVEL_5'], ['emergencyContactPhone', 'abc']])('flags invalid %s without copying it', (target, value) => {
    const result = extraProfileData([field({target, value})], phone);
    expect(result.findings[0]).toEqual(expect.objectContaining({field: 'extraFields', column: 30})); expect(result.data).toEqual({});
  });
  it('never silently chooses between two columns mapped to one field', () => {
    expect(extraProfileData([field({target: 'grade'}), field({column: 31, target: 'grade'})], phone).findings[0].message).toContain('Two columns');
  });
  it('optional empty/N/A values stay preserved and map to null', () => {
    const input = [field({target: 'trainingNeeded', value: 'N/A'})];
    expect(extraProfileData(input, phone)).toEqual({data: {trainingNeeded: null}, findings: []}); expect(input[0].value).toBe('N/A');
  });
  it('allows correction while preserving original evidence', () => {
    expect(reviseExtraFields([field()], [field({heading: 'forged', originalValue: 'forged', value: 'fixed', target: 'grade'})]))
      .toEqual([field({value: 'fixed', target: 'grade'})]);
  });
  it('refuses missing or newly invented source columns during an edit', () => {
    expect(() => reviseExtraFields([field()], [])).toThrow('columns changed');
    expect(() => reviseExtraFields([field()], [field({column: 9})])).toThrow('columns changed');
  });
});
