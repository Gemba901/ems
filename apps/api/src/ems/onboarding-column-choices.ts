import { isExtraProfileField } from './onboarding-extra-fields';

/**
 * Remembered import column choices: one destination per organisation and heading.
 * Destinations use the import page's own values: a core field key, "fullName",
 * "extra" (keep for reference), "ignore", or "profile:<field>" (date fields may add "@DMY" or "@MDY").
 * They are pre-fill hints only; the import page still shows and validates every choice.
 */
export const MAX_COLUMN_CHOICES = 500;

/** Case-, width- and punctuation-insensitive form of a heading, e.g. "Staff No." → "staff no". */
export function columnHeadingKey(heading: unknown): string {
  return String(heading ?? '').normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 200);
}

export function isColumnDestination(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  // A date column may also remember its day/month order, e.g. "profile:dateOfBirth@DMY".
  const dated = /^(profile:date[A-Za-z]+)@(?:DMY|MDY)$/.exec(value);
  if (dated) return isExtraProfileField(dated[1].slice(8));
  if (value === 'extra' || value === 'ignore' || value === 'fullName') return true;
  if (value.startsWith('profile:')) return isExtraProfileField(value.slice(8));
  // Core onboarding fields are plain identifiers; the web ignores any it no longer offers.
  return /^[a-z][A-Za-z0-9]{1,40}$/.test(value);
}

/** Last choice per heading wins; blank headings and invalid destinations are skipped. */
export function normaliseColumnChoices(choices: { heading: string; destination: string }[]) {
  const byKey = new Map<string, { headingKey: string; heading: string; destination: string }>();
  for (const choice of choices) {
    const headingKey = columnHeadingKey(choice.heading);
    if (!headingKey || !isColumnDestination(choice.destination)) continue;
    byKey.set(headingKey, { headingKey, heading: String(choice.heading).trim().slice(0, 200), destination: choice.destination });
  }
  return [...byKey.values()];
}
