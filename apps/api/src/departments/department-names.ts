export const MAX_DEPARTMENTS_PER_SETUP = 100;
export const MAX_DEPARTMENT_NAME_LENGTH = 160;

export function cleanDepartmentName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

// Preserve meaningful punctuation and non-English names. Do not merge similar names.
export function departmentNameKey(value: string): string {
  return cleanDepartmentName(value).toLowerCase();
}

// Match the current EMS import lookup without changing the shared department name.
export function departmentImportKey(value: string): string {
  return value.replace(/[\n\r]+/g, ' ').replace(/\([^)]*\)/g, '')
    .replace(/\s*\/\s*/g, ' ').replace(/[^a-zA-Z0-9]+/g, '').trim().toLowerCase();
}

export function departmentNameIssue(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'Enter a department name.';
  const name = cleanDepartmentName(value);
  if (name.length > MAX_DEPARTMENT_NAME_LENGTH) return 'Use at most 160 characters for a department name.';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'Remove control characters from the department name.';
  const marker = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!/[\p{L}\p{N}]/u.test(name) || /^(na|nil|none|null|notapplicable|noinfo|noinformationavailable)$/.test(marker)) {
    return 'Enter a real department name instead of a placeholder.';
  }
  return null;
}
