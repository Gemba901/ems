import parsePhoneNumber, { getCountries } from 'libphonenumber-js/max';

const COUNTRIES = getCountries();

/** Import input: explicit + keeps its country; other input uses the batch country. */
export function normalisePhone(value: string | null, defaultPhoneCountry: string | null): string | null {
  const raw = value?.trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  const country = COUNTRIES.find((code) => code === defaultPhoneCountry);
  if (!raw.startsWith('+') && !country) return null;
  const parsed = parsePhoneNumber(raw, { defaultCountry: country, extract: false });
  if (!parsed?.isValid()) return null;

  const type = parsed.getType();
  if (type !== 'MOBILE' && type !== 'FIXED_LINE_OR_MOBILE') {
    return null;
  }

  return parsed.number.slice(1);
}

/** Existing storage is international digits, optionally with + and formatting. No country guessing. */
export function storedPhone(value: string | null): string | null {
  const raw = value?.trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits.startsWith('0')) return null;
  const parsed = parsePhoneNumber(`+${digits}`, { extract: false });
  return parsed?.isValid() ? parsed.number.slice(1) : null;
}

/** Local forms are lookup warnings only: never use them to attach an account. */
export function phoneLookupDigits(phone: string): string[] {
  const parsed = parsePhoneNumber(`+${phone}`, { extract: false });
  if (!parsed?.isValid()) return [phone];
  return [...new Set([
    phone,
    String(parsed.nationalNumber),
    parsed.formatNational().replace(/\D/g, ''),
  ])];
}
