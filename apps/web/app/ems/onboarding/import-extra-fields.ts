import * as XLSX from 'xlsx';
import type { UpdateOnboardingRecordPayload } from '@/services/ems.service';
import { readExtraFields, type ImportedExtraField, isExtraProfileField } from '../../../components/ems/onboarding-extra-fields';
import { mapHeaders, findMappingConflicts, splitFullName, type Field, type MapField, type NameOrder } from './column-map';

export function importHeaderCells(grid: unknown[][], headerIndex: number): unknown[] {
  if (headerIndex < 0) return [];
  const width = grid.slice(headerIndex).reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({length: width}, (_, col) => grid[headerIndex]?.[col] ?? '');
}
export function initialImportMapping(headers: unknown[], dataRows: unknown[][] = []): (MapField | null)[] {
  return mapHeaders(headers).map((field, i) => field ?? (String(headers[i] ?? '').trim() || dataRows.some(row => String(row[i] ?? '').trim()) ? 'extra' : null));
}
export type ParsedImportRow = UpdateOnboardingRecordPayload & {rowNumber: number};
/** Extra columns use Excel positions, so repeated headings cannot overwrite each other. */
export function buildImportRows(grid: unknown[][], headerIndex: number, firstRow: number, mapping: (MapField | null)[], nameOrder: NameOrder,
  sheet?: XLSX.WorkSheet, date1904 = false): {rows: ParsedImportRow[]; errors: string[]} {
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
        if ((target === 'dateOfBirth' || target === 'dateJoined') && typeof raw === 'number') {
          const d = XLSX.SSF.parse_date_code(raw, {date1904});
          if (d && !(d.y === 1900 && d.m === 2 && d.d === 29) && raw >= 0 && d.d >= 1)
            value = `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
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
