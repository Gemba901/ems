// Shared cleaning for onboarding records. Name matching preserves punctuation and Unicode.
export function normaliseKey(value: string | null): string {
  return String(value ?? '')
    .replace(/[\n\r]+/g, ' ')        // line breaks inside a cell
    .replace(/\([^)]*\)/g, '')       // "(Line 1)" and similar notes
    .replace(/\s*\/\s*/g, ' ')       // "Work Area / Section"
    .replace(/[^a-zA-Z0-9]+/g, '')   // everything else removed
    .trim()
    .toLowerCase();
}


/** The allowed value matching free text like "Full Time" or "full-time", or null if none matches. */
export function matchEnumValue(value: string | null, allowed: Set<string>): string | null {
  const key = normaliseKey(value);
  if (!key) return null;
  return [...allowed].find((v) => normaliseKey(v) === key) ?? null;
}

/** Placeholders meaning "unknown". Treated exactly like an empty cell. */
const BLANK_PLACEHOLDERS = new Set(['nil', 'none', 'null', 'noinformationavailable', 'noinfo']);

/** Answers meaning "does not apply to this employee". */
const NOT_APPLICABLE_VALUES = new Set(['na', 'notapplicable']);

export function isBlankValue(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const key = normaliseKey(value);
  return (key === '' && !/[\p{L}\p{N}]/u.test(value)) || (BLANK_PLACEHOLDERS.has(key) && !/[^\x00-\x7F]/.test(value)); // '' covers "-", "--", "?" and similar
}

export function isNotApplicable(value: string | null | undefined): boolean {
  return !!value?.trim() && NOT_APPLICABLE_VALUES.has(normaliseKey(value));
}

/** A copy of the record with text trimmed and "unknown" placeholders turned into null. */
export function cleanRecord<T extends object>(record: T): T {
  const copy = { ...record } as Record<string, unknown>;
  for (const [key, value] of Object.entries(copy)) {
    if (typeof value === 'string') copy[key] = isBlankValue(value) ? null : value.trim();
  }
  return copy as T;
}

/** Normalize presentation only; do not erase meaningful name/title characters. */
export function reportingKey(value?: string | null): string {
  if (isBlankValue(value)) return '';
  return (value ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Complete name words in any order. Preserve repeated words, punctuation and accents. */
export function completeNameKey(value?: string | null): string {
  return reportingKey(value).split(/[\s,]+/u).filter(Boolean).sort().join('\u0000');
}
