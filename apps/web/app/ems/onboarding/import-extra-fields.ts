import * as XLSX from 'xlsx';
import type { UpdateOnboardingRecordPayload } from '@/services/ems.service';
import { readExtraFields, type ImportedExtraField, isExtraProfileField } from '../../../components/ems/onboarding-extra-fields';
import { excelSerialToIso, readDate, type DateKind, type DateOrder } from '../../../components/ems/import-dates';
import { mapHeaders, findMappingConflicts, splitFullName, MAPPABLE_FIELDS, type Field, type MapField, type NameOrder } from './column-map';

export function importHeaderCells(grid: unknown[][], headerIndex: number): unknown[] {
  if (headerIndex < 0) return [];
  const width = grid.slice(headerIndex).reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({length: width}, (_, col) => grid[headerIndex]?.[col] ?? '');
}
/** A heading containing "ignore" in any case starts as Ignore, e.g. "Test case (ignore this column)". */
export function headingSaysIgnore(heading: unknown): boolean {
  return /ignore/i.test(String(heading ?? ''));
}
export function initialImportMapping(headers: unknown[], dataRows: unknown[][] = []): (MapField | null)[] {
  return mapHeaders(headers).map((field, i) => headingSaysIgnore(headers[i]) ? null
    : field ?? (String(headers[i] ?? '').trim() || dataRows.some(row => String(row[i] ?? '').trim()) ? 'extra' : null));
}
const REMEMBERABLE = new Set<string>(['extra', ...MAPPABLE_FIELDS.map(field => field.key)]);
/**
 * Apply the organisation's remembered choices on top of built-in recognition.
 * Order: "ignore" in the heading, then a remembered choice, then built-in recognition.
 * Remembered destinations this page no longer offers are skipped.
 */
export function applyRememberedChoices(headers: unknown[], mapping: (MapField | null)[], remembered: (string | null)[]) {
  const next = [...mapping], flags = mapping.map(() => false);
  const dateOrders: Record<number, DateOrder> = {};
  headers.forEach((heading, i) => {
    // A date column may carry its day/month order, e.g. "profile:dateOfBirth@DMY".
    const [choice, order] = (remembered[i] ?? '').split('@');
    if (!choice || !String(heading ?? '').trim() || headingSaysIgnore(heading)) return;
    if (choice === 'ignore') { next[i] = null; flags[i] = true; }
    else if (REMEMBERABLE.has(choice)) {
      next[i] = choice as MapField; flags[i] = true;
      if (order === 'DMY' || order === 'MDY') dateOrders[i] = order;
    }
  });
  return { mapping: next, remembered: flags, dateOrders };
}
/** What to remember once an import's rows are saved: every titled column's final choice. */
export function columnChoicesToSave(headers: unknown[], mapping: (MapField | null)[], dateOrders: Record<number, DateOrder | null> = {}) {
  return headers.flatMap((heading, i) => {
    const text = String(heading ?? '').trim();
    const order = mapping[i]?.startsWith('profile:date') ? dateOrders[i] : null;
    return text ? [{ heading: text.slice(0, 200), destination: `${mapping[i] ?? 'ignore'}${order ? `@${order}` : ''}` }] : [];
  }).slice(0, 500);
}
export type ParsedImportRow = UpdateOnboardingRecordPayload & {rowNumber: number};
/** Extra columns use Excel positions, so repeated headings cannot overwrite each other. */
export type ImportDateOptions = {
  /** Day/month order per 0-based sheet column; null when unknown (ambiguous values stay as written). */
  dateOrders?: Record<number, DateOrder | null>;
  /** Reference day for plausibility (ages, future dates); defaults to today. */
  today?: string;
};
const DATE_KIND: Partial<Record<string, DateKind>> = { dateOfBirth: 'birth', dateJoined: 'event' };
/** True when Excel stores the cell as a date: a date-formatted number, or a parsed date. */
function isDateCell(cell: XLSX.CellObject | undefined): boolean | null {
  if (!cell) return null;
  if (cell.t === 'd') return true;
  return typeof cell.z === 'string' ? XLSX.SSF.is_date(cell.z) : null;
}
export function buildImportRows(grid: unknown[][], headerIndex: number, firstRow: number, mapping: (MapField | null)[], nameOrder: NameOrder,
  sheet?: XLSX.WorkSheet, date1904 = false, dates: ImportDateOptions = {}): {rows: ParsedImportRow[]; errors: string[]} {
  const today = dates.today ?? new Date().toISOString().slice(0, 10);
  const rows: ParsedImportRow[] = [], errors: string[] = [];
  if (headerIndex < 0) return {rows, errors};
  const firstColumn = sheet?.["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.c : 0;
  const conflicts = new Set(findMappingConflicts(mapping).map(f => f.field));
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const rowNumber = firstRow + i + 1;
    const record: ParsedImportRow = {rowNumber};
    const extras: ImportedExtraField[] = [];
    let hasCoreValue = false, fullName = '';
    mapping.forEach((field, col) => {
      if (!field || conflicts.has(field)) return;
      const raw = grid[i]?.[col];
      const text = String(raw ?? '').trim();
      if (field === 'extra' || field.startsWith('profile:')) {
        const target = field === 'extra' ? null : field.slice(8);
        if (target !== null && !isExtraProfileField(target)) return;
        const cell = sheet?.[XLSX.utils.encode_cell({r: rowNumber - 1, c: firstColumn + col})];
        const originalValue = cell?.w ?? String(raw ?? '');
        let value = originalValue;
        const kind = target ? DATE_KIND[target] : undefined;
        if (kind) {
          // A date-formatted cell is a real date. A plain number (General) is digits such as 220987,
          // except when the format is unknown and the number reads as a plausible date.
          const dateCell = isDateCell(cell);
          const serial = typeof raw === 'number' && dateCell !== false ? excelSerialToIso(raw, date1904, kind, today) : null;
          const text = typeof raw === 'number' && !serial ? String(raw) : originalValue;
          const reading = serial ? { iso: serial } : readDate(text, kind, today, dates.dateOrders?.[col] ?? null);
          // Only one plausible reading converts; anything else stays as written for HR to choose.
          if ('iso' in reading) value = reading.iso;
        }
        extras.push({column: firstColumn + col + 1, heading: String(grid[headerIndex]?.[col] ?? ''), originalValue, value, target});
      } else {
        if (!text) return;
        hasCoreValue = true;
        if (field === 'fullName') fullName = text;
        else record[field as Field] = text;
      }
    });
    // Extra notes below a table must not become empty employee records.
    if (!hasCoreValue) continue;
    if (fullName) {
      const parts = splitFullName(fullName, nameOrder);
      record.firstName ??= parts.firstName; record.middleName ??= parts.middleName; record.lastName ??= parts.lastName;
    }
    try { if (extras.length) record.extraFields = readExtraFields(extras); }
    catch (error) { errors.push(`Excel row ${rowNumber}: ${error instanceof Error ? error.message : 'Additional information is invalid.'}`); }
    rows.push(record);
  }
  return {rows, errors};
}
/** Count the actual JSON wrapper and UTF-8 bytes, including a single unusually large row. */
export function packImportRows<T>(rows: T[], maxBytes = 80_000, maxRows = 500): T[][] {
  const encoder = new TextEncoder(), chunks: T[][] = [];
  let chunk: T[] = [], bytes = encoder.encode('{"records":[]}').length;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length;
    if (size + encoder.encode('{"records":[]}').length > maxBytes)
      throw new Error('One record exceeds the upload size limit. Shorten large values or ignore unnecessary columns before importing.');
    if (chunk.length && (bytes + size + 1 > maxBytes || chunk.length >= maxRows)) {
      chunks.push(chunk); chunk = []; bytes = encoder.encode('{"records":[]}').length;
    }
    bytes += size + (chunk.length ? 1 : 0); chunk.push(row);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
