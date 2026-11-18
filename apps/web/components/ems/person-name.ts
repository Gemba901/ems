/**
 * A person's full name for display. A middle name written as N/A (the import template asks for N/A when
 * there is none) is left out, the same way the API matches names.
 */
const NOT_APPLICABLE = new Set(['na', 'notapplicable']);
const isNotApplicable = (value: string) => NOT_APPLICABLE.has(value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));

export function personFullName(p: { firstName?: string | null; middleName?: string | null; lastName?: string | null } | null | undefined): string {
  if (!p) return '';
  const middle = p.middleName?.trim();
  return [p.firstName, middle && !isNotApplicable(middle) ? middle : null, p.lastName].filter(Boolean).join(' ').trim();
}
