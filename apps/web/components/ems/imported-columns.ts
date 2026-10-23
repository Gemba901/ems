import { EXTRA_PROFILE_FIELDS, type ImportedExtraField } from './onboarding-extra-fields';

export type ColumnSummary = {
  key: string; column: number; heading: string;
  total: number; withValue: number; samples: string[];
  /** Records that can still change: not registered, not excluded. */
  open: number; targets: Set<string | null>;
};

export const destinationLabel = (target: string | null) =>
  target ? EXTRA_PROFILE_FIELDS.find(field => field.key === target)?.label ?? target : 'Reference only';

/** One row per extra column across the import, in sheet order. Same column and heading = same column. */
export function summariseImportedColumns(batch: { records: { status: string; extraFields?: ImportedExtraField[] | null }[] }): ColumnSummary[] {
  const byKey = new Map<string, ColumnSummary>();
  for (const record of batch.records) {
    for (const field of record.extraFields ?? []) {
      const key = `${field.column}\u0000${field.heading}`;
      const row = byKey.get(key) ?? { key, column: field.column, heading: field.heading, total: 0, withValue: 0, samples: [], open: 0, targets: new Set<string | null>() };
      row.total++;
      const value = field.value.trim();
      if (value) { row.withValue++; if (row.samples.length < 3 && !row.samples.includes(value)) row.samples.push(value); }
      if (record.status !== 'REGISTERED' && record.status !== 'EXCLUDED') { row.open++; row.targets.add(field.target ?? null); }
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) => a.column - b.column || a.heading.localeCompare(b.heading));
}
