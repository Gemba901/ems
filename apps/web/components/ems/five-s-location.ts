/** Keep the API and web copies in sync. This category does not grant module access. */
export const FIVE_S_LOCATION_LABELS = {
  STORE: 'Store',
  OFFICE: 'Office',
  PRODUCTION_SHOP_FLOOR: 'Production shop floor',
} as const;
export type FiveSLocationCategory = keyof typeof FIVE_S_LOCATION_LABELS;
export const FIVE_S_LOCATION_ERROR = 'Choose Store, Office or Production shop floor, or leave this optional field blank.';
/** null means not supplied; undefined means supplied but invalid. */
export function normaliseFiveSLocation(value: unknown): FiveSLocationCategory | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || /^(?:n\/?a|not applicable|nil|none|null|no information available|no info|-+)$/i.test(text)) return null;
  const key = text.toUpperCase().replace(/[\s_-]+/g, '_');
  return Object.prototype.hasOwnProperty.call(FIVE_S_LOCATION_LABELS, key) ? key as FiveSLocationCategory : undefined;
}
/** DTO validation must see invalid input, not convert it to an omitted value. */
export function fiveSProfileValue(value: unknown): unknown {
  const normalised = normaliseFiveSLocation(value);
  return normalised === undefined ? value : normalised;
}
