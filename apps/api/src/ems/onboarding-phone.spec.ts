import { normalisePhone, storedPhone, phoneLookupDigits } from './onboarding-phone';

describe('Onboarding phone formats', () => {
  it.each([
    ['0712345678', 'KE', '254712345678'],
    ['0112345678', 'KE', '254112345678'],
    ['254712345678', 'KE', '254712345678'],
    ['+254 712-345-678', 'US', '254712345678'],
    ['(213) 373-4253', 'US', '12133734253'],
    ['090-1234-5678', 'JP', '819012345678'],
    ['+81 90-1234-5678', 'KE', '819012345678'],
    ['+1 213 373 4253', null, '12133734253'],
    ['0712345678', null, null],
    ['0712345678', 'XX', null],
    ['call 0712345678', 'KE', null],
    ['0712345678 ext 9', 'KE', null],
    ['5690-97543', 'KE', null],
    ['+254569097543', 'KE', null],
    ['123', 'KE', null],
    ['', 'KE', null],
    [null, 'KE', null],
  ])('normalises %s with %s to %s', (raw, country, expected) => {
    expect(normalisePhone(raw, country)).toBe(expected);
  });

  it.each(['254712345678', '+254712345678', '+254 (712) 345-678'])('recognises stored international %s', (raw) => {
    expect(storedPhone(raw)).toBe('254712345678');
  });
  it('does not assign a country to an older local number', () => {
    expect(storedPhone('0712345678')).toBeNull();
  });
  it('includes local forms for conflict detection, not identity linking', () => {
    expect(phoneLookupDigits('254712345678')).toEqual(expect.arrayContaining(['254712345678', '712345678', '0712345678']));
  });
});
