import type { CellObject, WorkBook, WorkSheet } from "xlsx";
import { assetOptionLabel } from "./asset-option-labels";
import {
  ASSET_LEVELS,
  CATEGORIES,
  ECONOMIC_IMPACT,
  HEALTH,
  OPERATING,
  USAGE,
  assetSchema,
  emptyAsset,
  nextAssetCode,
  validateAsset,
  type Asset,
  type AssetInput,
} from "./asset-preview";

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export type AssetTemplateVariant = "sample" | "empty";

export type ImportOperator = {
  id: string;
  name: string;
  label: string;
  code?: string;
};
export type AssetImportRow = {
  rowNumber: number;
  input: AssetInput;
  /** Workbook references stay as codes until commit so new parents can follow children. */
  parentCode?: string;
};
export type AssetImportIssue = {
  rowNumber?: number;
  field?: string;
  message: string;
};
export type AssetImportResult = {
  /** Includes invalid rows for preview; commit only when issues is empty. */
  rows: AssetImportRow[];
  issues: AssetImportIssue[];
  totalRows: number;
};

type ImportField = Exclude<keyof AssetInput, "operator" | "photo" | "stage">;
type Column = {
  header: string;
  key: ImportField;
  help: string;
  required?: boolean;
  values?: readonly string[];
};
const COLUMNS: Column[] = [
  {
    header: "Asset code",
    key: "code",
    help: "Optional. Leave blank to generate a unique asset code automatically. Any code you enter must be unique; existing assets are never overwritten.",
  },
  {
    header: "Asset name",
    key: "name",
    required: true,
    help: "Required. Equipment or machine name.",
  },
  {
    header: "Asset level",
    key: "level",
    values: ASSET_LEVELS,
    help: "Optional. Plant, Area, Line, Station, Equipment or Component. Defaults to Equipment. Parent asset code determines the hierarchy.",
  },
  {
    header: "Category",
    key: "category",
    required: true,
    values: CATEGORIES,
    help: "Required. Choose one of the allowed values.",
  },
  {
    header: "Purpose",
    key: "purpose",
    help: "Optional. What the equipment is used for.",
  },
  { header: "Site", key: "site", help: "Optional. Plant or site name." },
  {
    header: "Department",
    key: "department",
    help: "Optional. Department name.",
  },
  {
    header: "Workplace / Gemba",
    key: "location",
    required: true,
    help: "Required. Area where this asset is located.",
  },
  {
    header: "Parent asset code",
    key: "parentId",
    help: "Optional. Use an existing asset code or a code explicitly entered for another row in this upload. Do not guess an auto-generated code. Circular relationships are not allowed.",
  },
  {
    header: "Usage status",
    key: "usage",
    values: USAGE,
    help: `Optional. Defaults to ${assetOptionLabel("usage", "Active")}.`,
  },
  {
    header: "Health",
    key: "health",
    values: HEALTH,
    help: "Optional. Defaults to Good.",
  },
  {
    header: "Criticality",
    key: "criticality",
    values: ["A", "B", "C"],
    help: `Optional. Defaults to ${assetOptionLabel("criticality", "B")}.`,
  },
  {
    header: "Operating status",
    key: "operating",
    values: OPERATING,
    help: "Optional. Defaults to Operational.",
  },
  {
    header: "Economic impact",
    key: "economicImpact",
    values: ECONOMIC_IMPACT,
    help: `Optional. Defaults to ${assetOptionLabel("economicImpact", "Moderate")}.`,
  },
  {
    header: "Primary operator code",
    key: "operatorId",
    help: "Optional. Enter the employee code of a member in your organization, or leave blank. Do not enter an internal ID.",
  },
  {
    header: "Backup operator",
    key: "backupOperator",
    help: "Optional. Backup operator's name.",
  },
  {
    header: "Maintenance owner",
    key: "maintenanceOwner",
    help: "Enter an owner or a maintenance team (at least one is required).",
  },
  {
    header: "Maintenance team",
    key: "team",
    help: "Enter a team or a maintenance owner (at least one is required).",
  },
  {
    header: "Manufacturer",
    key: "manufacturer",
    help: "Optional. Manufacturer's name.",
  },
  { header: "Model", key: "model", help: "Optional. Model name or number." },
  {
    header: "Serial number",
    key: "serialNumber",
    help: "Optional. Use text to preserve leading zeros.",
  },
  {
    header: "Capacity",
    key: "capacity",
    help: "Optional. Capacity and unit, for example 500 kg/hour.",
  },
  {
    header: "Installation date",
    key: "installedOn",
    help: "Optional. YYYY-MM-DD or a real Excel date cell.",
  },
  {
    header: "Warranty expiry",
    key: "warrantyUntil",
    help: "Optional. YYYY-MM-DD or a real Excel date cell. Must be on or after installation.",
  },
  {
    header: "Description",
    key: "description",
    help: "Optional. Up to 4,000 characters.",
  },
  { header: "Notes", key: "notes", help: "Optional. Up to 4,000 characters." },
];
export const ASSET_IMPORT_COLUMNS: readonly Column[] = COLUMNS;
const inputSchema = assetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  history: true,
});
const normalize = (value: string) => value.trim().toLowerCase();
// Whitespace in display labels is flexible; asset/operator codes retain their
// existing comparison rules.
const normalizeChoice = (value: string) =>
  normalize(value).replace(/\s+/g, " ");
const allowedValueLabels = (column: Column) =>
  column.values?.map((value) => assetOptionLabel(column.key, value)) ?? [];
const fieldName = (key: string) =>
  COLUMNS.find((column) => column.key === key)?.header ?? key;

function headerIssue(message: string): AssetImportResult {
  return { rows: [], issues: [{ message }], totalRows: 0 };
}

function realDate(year: number, month: number, day: number): string | null {
  if (
    year < 1900 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  )
    return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? realDate(Number(match[1]), Number(match[2]), Number(match[3]))
    : null;
}

function excelDate(serial: number, date1904: boolean) {
  const days = Math.floor(serial);
  // Excel's 1900 calendar includes a fictitious February 29 (serial 60).
  if (
    !Number.isFinite(days) ||
    days < (date1904 ? 0 : 1) ||
    (!date1904 && days === 60)
  )
    return null;
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 31);
  const offset = !date1904 && days > 60 ? days - 1 : days;
  const value = new Date(epoch + offset * 86400000);
  if (!Number.isFinite(value.getTime())) return null;
  return realDate(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

function collectRowIssues(rows: AssetImportRow[], current: Asset[]) {
  const issues: AssetImportIssue[] = [];
  const codeMap = new Map(
    current.map((asset) => [normalize(asset.code), asset]),
  );
  const existingCodes = new Set(codeMap.keys());
  const seen = new Map<string, number>();
  const now = new Date().toISOString();
  const drafts = rows.map((row, index) => ({
    ...row.input,
    id: `import-row-${index}`,
    createdAt: now,
    updatedAt: now,
    history: [],
  }));
  // Temporary IDs must not collide with existing records, including imported ones.
  const occupied = new Set(current.map((asset) => asset.id));
  for (const draft of drafts) {
    while (occupied.has(draft.id)) draft.id = `_${draft.id}`;
    occupied.add(draft.id);
    // Every explicitly supplied code is already in drafts before allocation.
    // Keep generated codes out of the parent-code lookup below: users cannot
    // reference codes that are only assigned when the upload is committed.
    if (!draft.code.trim()) draft.code = nextAssetCode([...current, ...drafts]);
  }
  rows.forEach((row, index) => {
    const code = normalize(row.input.code);
    if (!code) return;
    if (existingCodes.has(code))
      issues.push({
        rowNumber: row.rowNumber,
        field: "Asset code",
        message: "This asset code already exists. Choose a new code.",
      });
    if (seen.has(code))
      issues.push({
        rowNumber: row.rowNumber,
        field: "Asset code",
        message: `This code is also used on row ${seen.get(code)}.`,
      });
    else seen.set(code, row.rowNumber);
    if (code) codeMap.set(code, drafts[index]);
  });
  rows.forEach((row, index) => {
    if (row.parentCode !== undefined) {
      const parent = row.parentCode.trim()
        ? codeMap.get(normalize(row.parentCode))
        : undefined;
      drafts[index].parentId = parent?.id ?? "";
      if (row.parentCode.trim() && !parent)
        issues.push({
          rowNumber: row.rowNumber,
          field: "Parent asset code",
          message:
            "No asset with this code exists in your assets or this upload.",
        });
    }
  });
  const all = [...current, ...drafts];
  rows.forEach((row, index) => {
    const input = drafts[index];
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        issues.push({
          rowNumber: row.rowNumber,
          field: fieldName(String(issue.path[0])),
          message: issue.message,
        });
    for (const key of ["installedOn", "warrantyUntil"] as const)
      if (input[key] && !isoDate(input[key]))
        issues.push({
          rowNumber: row.rowNumber,
          field: fieldName(key),
          message: "Enter a real date in YYYY-MM-DD format (1900–9999).",
        });
    if (input.stage !== "Registered")
      issues.push({
        rowNumber: row.rowNumber,
        field: "Stage",
        message: "Bulk uploads must create registered assets.",
      });
    for (const [key, message] of Object.entries(
      validateAsset(input, all, input.id),
    )) {
      // Duplicate codes already have a more specific row-level message above.
      if (key === "code" && input.code.trim()) continue;
      issues.push({ rowNumber: row.rowNumber, field: fieldName(key), message });
    }
  });
  return { issues, drafts };
}

/** Revalidates against the latest asset list; no browser storage is mutated here. */
export function prepareAssetImport(
  rows: AssetImportRow[],
  current: Asset[],
): Asset[] {
  if (!rows.length) throw new Error("Add at least one asset before uploading.");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new Error(`Upload up to ${MAX_IMPORT_ROWS} assets at a time.`);
  const cleaned = rows.map((row) => ({
    ...row,
    input: Object.fromEntries(
      Object.entries(row.input).map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : value,
      ]),
    ) as AssetInput,
  }));
  const { issues, drafts } = collectRowIssues(cleaned, current);
  if (issues.length) {
    const first = issues[0];
    throw new Error(
      `Row ${first.rowNumber}${first.field ? ` · ${first.field}` : ""}: ${first.message}`,
    );
  }
  const idMap = new Map(drafts.map((asset) => [asset.id, crypto.randomUUID()]));
  return drafts.map((asset) =>
    assetSchema.parse({
      ...asset,
      id: idMap.get(asset.id),
      parentId: idMap.get(asset.parentId) ?? asset.parentId,
      history: [
        {
          id: crypto.randomUUID(),
          at: asset.createdAt,
          message: "Asset registered through a bulk upload in this preview.",
        },
      ],
    }),
  );
}

/** Preview examples use parent codes, just like spreadsheet input rows. */
export const ASSET_TEMPLATE_SAMPLE_ROWS: readonly AssetInput[] = [
  {
    ...emptyAsset,
    code: "SAMPLE-IMM-001",
    name: "Injection moulding machine",
    category: "Production equipment",
    purpose: "Injection moulding of plastic parts",
    location: "Moulding bay 01",
    site: "Main plant",
    department: "Injection moulding",
    team: "Mechanical maintenance",
    criticality: "A",
    installedOn: "2026-01-15",
    warrantyUntil: "2027-01-15",
    description: "Sample production machine for moulding plastic components.",
  },
  {
    ...emptyAsset,
    code: "SAMPLE-PUMP-001",
    name: "Hydraulic pump",
    level: "Component",
    category: "Auxiliary equipment",
    purpose: "Hydraulic power for the moulding machine",
    location: "Moulding bay 01",
    site: "Main plant",
    department: "Injection moulding",
    parentId: "SAMPLE-IMM-001",
    team: "Mechanical maintenance",
    description: "Sample component linked to the machine by its asset code.",
  },
  {
    ...emptyAsset,
    code: "",
    name: "Material dryer",
    category: "Auxiliary equipment",
    purpose: "Drying plastic granules before moulding",
    location: "Material preparation area",
    site: "Main plant",
    department: "Material preparation",
    team: "Mechanical maintenance",
    description: "Sample dryer with an asset code assigned during upload.",
  },
];

export async function createAssetTemplate(
  variant: AssetTemplateVariant = "empty",
): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const examples = variant === "sample" ? ASSET_TEMPLATE_SAMPLE_ROWS : [];
  const inputSheet = XLSX.utils.aoa_to_sheet([
    COLUMNS.map((column) => column.header),
    ...examples.map((example) => COLUMNS.map((column) => example[column.key])),
  ]);
  const instructions =
    "Keep the column headers unchanged. Enter one asset per row below the headers. Fill Asset name, Category, Workplace / Gemba, and at least one of Maintenance team or Maintenance owner.";
  COLUMNS.forEach((column, index) => {
    const cell = inputSheet[
      XLSX.utils.encode_cell({ r: 0, c: index })
    ] as CellObject;
    cell.c = [
      {
        a: "Gemba",
        t: [
          index === 0 ? instructions : "",
          column.help,
          column.values
            ? `Allowed values: ${allowedValueLabels(column).join(", ")}.`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    cell.c.hidden = true;
  });
  inputSheet["!cols"] = COLUMNS.map((column) => ({
    wch: Math.max(16, column.header.length + 2),
  }));
  XLSX.utils.book_append_sheet(workbook, inputSheet, "Assets");
  return workbook;
}

export async function downloadAssetTemplate(): Promise<void> {
  const workbook = await createAssetTemplate("empty");
  const XLSX = await import("xlsx");
  XLSX.writeFile(workbook, "tpm-assets-template.xlsx", {
    bookType: "xlsx",
    compression: true,
  });
}

function invalidCell(cell: CellObject | undefined) {
  if (cell?.f || cell?.F)
    return "Formulas are not supported. Replace the formula with its value.";
  if (cell?.t === "e")
    return "This cell contains an Excel error. Correct it before uploading.";
  return null;
}

export async function parseAssetWorkbook(
  file: File,
  assets: Asset[],
  operators: ImportOperator[],
): Promise<AssetImportResult> {
  if (!/\.xlsx$/i.test(file.name))
    return headerIssue(
      "Choose an Excel .xlsx file using the downloaded template.",
    );
  if (!file.size)
    return headerIssue(
      "This file is empty. Fill and save the Excel template, then try again.",
    );
  if (file.size > MAX_IMPORT_BYTES)
    return headerIssue(
      "The file is too large. Upload an Excel file up to 5 MB.",
    );
  const XLSX = await import("xlsx");
  let workbook: WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    if (
      signature[0] !== 0x50 ||
      signature[1] !== 0x4b ||
      signature[2] !== 0x03 ||
      signature[3] !== 0x04
    )
      return headerIssue(
        "This is not a valid .xlsx workbook. Save the template as an Excel Workbook (.xlsx).",
      );
    workbook = XLSX.read(buffer, {
      type: "array",
      sheets: "Assets",
      sheetRows: MAX_IMPORT_ROWS + 2,
      cellDates: false,
      cellFormula: true,
      cellText: false,
    });
  } catch {
    return headerIssue(
      "Could not read this Excel file. Save a new, unprotected copy of the template and try again.",
    );
  }
  const sheet: WorkSheet | undefined = workbook.Sheets.Assets;
  if (!sheet)
    return headerIssue(
      'The workbook must contain a sheet named "Assets". Download a fresh template.',
    );
  const reference = sheet["!fullref"] ?? sheet["!ref"];
  if (
    typeof reference !== "string" ||
    !/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(reference)
  )
    return headerIssue(
      "The Assets sheet is empty or has an invalid cell range. Download a fresh template.",
    );
  const range = XLSX.utils.decode_range(reference);
  if (
    !Number.isSafeInteger(range.e.r) ||
    range.e.r > MAX_IMPORT_ROWS ||
    range.s.r !== 0
  )
    return headerIssue(
      `Keep the header on row 1 and upload up to ${MAX_IMPORT_ROWS} rows below it. Remove extra rows and try again.`,
    );
  if (range.e.c >= COLUMNS.length || range.s.c !== 0)
    return headerIssue(
      `Use only the ${COLUMNS.length} template columns. Remove extra columns and try again.`,
    );
  const issues: AssetImportIssue[] = [];
  const columnMap = new Map<number, Column>();
  const known = new Map(
    COLUMNS.map((column) => [normalize(column.header), column]),
  );
  const headers = new Set<string>();
  for (let index = 0; index <= range.e.c; index++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: index })] as
      | CellObject
      | undefined;
    const bad = invalidCell(cell);
    if (bad)
      issues.push({ rowNumber: 1, field: `Column ${index + 1}`, message: bad });
    const name = typeof cell?.v === "string" ? normalize(cell.v) : "";
    const column = known.get(name);
    if (!column) {
      issues.push({
        rowNumber: 1,
        field: `Column ${index + 1}`,
        message:
          name === "primary operator id"
            ? 'Download the latest template and use "Primary operator code" with the employee code, not an internal ID.'
            : name
              ? `Unknown header "${String(cell?.v).slice(0, 100)}". Use the downloaded template headers.`
              : "A template header is missing. Keep every column header.",
      });
      continue;
    }
    if (headers.has(name))
      issues.push({
        rowNumber: 1,
        field: column.header,
        message: "This header is duplicated.",
      });
    headers.add(name);
    columnMap.set(index, column);
  }
  for (const column of COLUMNS)
    if (column.key !== "level" && !headers.has(normalize(column.header)))
      issues.push({
        rowNumber: 1,
        field: column.header,
        message: "This required template column is missing.",
      });
  if (issues.length) return { rows: [], issues, totalRows: 0 };
  const rows: AssetImportRow[] = [];
  const members = new Map<string, ImportOperator[]>();
  for (const operator of operators) {
    const code = operator.code ? normalize(operator.code) : "";
    if (!code) continue;
    const matches = members.get(code) ?? [];
    if (!matches.some((member) => member.id === operator.id))
      matches.push(operator);
    members.set(code, matches);
  }
  const date1904 = !!workbook.Workbook?.WBProps?.date1904;
  for (let rowIndex = 1; rowIndex <= range.e.r; rowIndex++) {
    const cells = Array.from(
      { length: range.e.c + 1 },
      (_, columnIndex) =>
        sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] as
          | CellObject
          | undefined,
    );
    if (
      cells.every(
        (cell) =>
          !invalidCell(cell) &&
          (cell?.v === undefined ||
            cell.v === null ||
            String(cell.v).trim() === ""),
      )
    )
      continue;
    const rowNumber = rowIndex + 1;
    const input: AssetInput = { ...emptyAsset, stage: "Registered" };
    const row: AssetImportRow = { rowNumber, input, parentCode: "" };
    cells.forEach((cell, columnIndex) => {
      const column = columnMap.get(columnIndex)!;
      const report = (message: string) =>
        issues.push({ rowNumber, field: column.header, message });
      const bad = invalidCell(cell);
      if (bad) {
        report(bad);
        return;
      }
      if (
        cell?.v === undefined ||
        cell.v === null ||
        String(cell.v).trim() === ""
      )
        return;
      if (column.key === "installedOn" || column.key === "warrantyUntil") {
        let value: string | null = null;
        if (cell.v instanceof Date && Number.isFinite(cell.v.getTime()))
          value = realDate(
            cell.v.getUTCFullYear(),
            cell.v.getUTCMonth() + 1,
            cell.v.getUTCDate(),
          );
        else if (typeof cell.v === "number")
          value = excelDate(cell.v, date1904);
        else if (typeof cell.v === "string") value = isoDate(cell.v.trim());
        if (!value)
          report(
            "Enter a real date as YYYY-MM-DD or an Excel date (1900–9999).",
          );
        else input[column.key] = value;
        return;
      }
      if (typeof cell.v !== "string" && typeof cell.v !== "number") {
        report("Enter text or a number in this field.");
        return;
      }
      const value = String(cell.v).trim();
      if (column.key === "parentId") {
        row.parentCode = value;
        if (value.length > 200) report("Use up to 200 characters.");
      } else if (column.key === "operatorId") {
        const matches = members.get(normalize(value)) ?? [];
        if (!matches.length)
          report(
            "No available member in this organization has this employee code. Enter a valid employee code or leave blank.",
          );
        else if (matches.length > 1)
          report(
            "More than one member has this employee code. Ask an administrator to correct the duplicate code, or leave this field blank.",
          );
        else {
          const operator = matches[0];
          input.operatorId = operator.id;
          input.operator = operator.name;
        }
      } else if (column.values) {
        const normalizedValue = normalizeChoice(value);
        const choice = column.values.find(
          (allowed) =>
            normalizeChoice(allowed) === normalizedValue ||
            normalizeChoice(assetOptionLabel(column.key, allowed)) ===
              normalizedValue ||
            // Accept usage names from previously downloaded templates.
            (column.key === "usage" &&
              normalizeChoice(`${allowed} Equipment`) === normalizedValue),
        );
        if (!choice)
          report(`Choose one of: ${allowedValueLabels(column).join(", ")}.`);
        else Object.assign(input, { [column.key]: choice });
      } else Object.assign(input, { [column.key]: value });
    });
    rows.push(row);
  }
  if (!rows.length)
    issues.push({
      message:
        "No assets found. Add your assets to the Assets sheet below its header.",
    });
  issues.push(...collectRowIssues(rows, assets).issues);
  return { rows, issues, totalRows: rows.length };
}
