import { cleanRecord, completeNameKey, isBlankValue, isNotApplicable, matchEnumValue } from './onboarding-text';
describe('shared onboarding text helpers', () => {
  it.each(['', '--', '?', 'nil', 'No information available', 'no info'])('treats %s as unknown', value => {
    expect(isBlankValue(value)).toBe(true);
  });
  it('retains Unicode names and trims surrounding whitespace', () => {
    expect(cleanRecord({ firstName: ' 美咲 ', lastName: '田中' })).toEqual({firstName:'美咲',lastName:'田中'});
  });
  it('keeps N/A distinct from an unknown value', () => {
    expect(isBlankValue('N/A')).toBe(false); expect(isNotApplicable('N/A')).toBe(true);
  });
  it('preserves enum matching', () => {
    expect(matchEnumValue('Full Time', new Set(['FULL_TIME']))).toBe('FULL_TIME');
  });
  it('does not flatten accented names into different spellings', () => {
    expect(completeNameKey('José Silva')).not.toBe(completeNameKey('Jose Silva'));
  });
});
