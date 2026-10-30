import type { CellObject, WorkBook } from "xlsx";
import type { Asset } from "./asset-preview";
import {
  ASSET_IMPORT_COLUMNS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseAssetWorkbook,
  type AssetImportIssue,
  type AssetImportResult,
  type ImportOperator,
} from "./asset-import";

export const MAX_IMPORT_COLUMNS = 100;
const MAX_WORKSHEET_ROWS = 5001;

export type AssetImportFile = {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: {
    /** Original Excel row or starting CSV line, including skipped blank rows. */
    rowNumber: number;
    values: string[];
    /** Keep formulas, errors and numeric dates intact for mapped validation. */
    cells: (CellObject | undefined)[];
  }[];
  date1904: boolean;
};
/** An absent index is unmatched; an empty string means an explicit Skip column. */
export type AssetColumnMapping = Record<number, string>;

type SourceRow = { rowNumber: number; cells: (CellObject | undefined)[] };

function occupied(cell: CellObject | undefined) {
  return !!(
    cell?.f ||
    cell?.F ||
    cell?.t === "e" ||
    (cell?.v !== undefined && cell.v !== null && String(cell.v).trim())
  );
}

function displayValue(cell: CellObject | undefined) {
  if (!cell) return "";
  if (cell.f) return `=${cell.f}`;
  if (cell.t === "e") return cell.w ?? "#ERROR";
  return cell.w ?? String(cell.v ?? "");
}

function finishFile(
  fileName: string,
  sheetName: string,
  source: SourceRow[],
  date1904 = false,
): AssetImportFile {
  const header = source[0];
  if (!header)
    throw new Error(
      "This file is empty. Add column headers and at least one asset.",
    );
  if (source.length < 2)
    throw new Error(
      "No assets found. Add at least one asset below the column headers.",
    );
  if (source.length - 1 > MAX_IMPORT_ROWS)
    throw new Error(`Upload up to ${MAX_IMPORT_ROWS} assets at a time.`);
  if (header.cells.some((cell) => cell?.f || cell?.F || cell?.t === "e"))
    throw new Error(
      "Column headers must contain plain text, without formulas or Excel errors.",
    );
  const width = Math.max(...source.map((row) => row.cells.length));
  if (width > MAX_IMPORT_COLUMNS)
    throw new Error(
      `Upload up to ${MAX_IMPORT_COLUMNS} source columns at a time.`,
    );
  const headers = Array.from({ length: width }, (_, index) =>
    displayValue(header.cells[index]).trim(),
  );
  if (headers.some((value) => value.length > 200))
    throw new Error("Column headers must be 200 characters or fewer.");
  return {
    fileName,
    sheetName,
    headers,
    date1904,
    rows: source.slice(1).map((row) => ({
      rowNumber: row.rowNumber,
      values: Array.from({ length: width }, (_, index) =>
        displayValue(row.cells[index]),
      ),
      cells: Array.from({ length: width }, (_, index) => row.cells[index]),
    })),
  };
}

function readCsv(text: string): SourceRow[] {
  const source: SourceRow[] = [];
  let field = "";
  let values: string[] = [];
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let rowStart = 1;
  function finishField() {
    values.push(field);
    if (values.length > MAX_IMPORT_COLUMNS)
      throw new Error(
        `Line ${rowStart}: upload up to ${MAX_IMPORT_COLUMNS} source columns at a time.`,
      );
    field = "";
    closedQuote = false;
  }
  function finishRow() {
    finishField();
    if (values.some((value) => value.trim())) {
      source.push({
        rowNumber: rowStart,
        cells: values.map((value) => ({ t: "s", v: value })),
      });
      if (source.length > MAX_IMPORT_ROWS + 1)
        throw new Error(`Upload up to ${MAX_IMPORT_ROWS} assets at a time.`);
    }
    values = [];
  }
  const content = text.replace(/^\uFEFF/, "");
  if (content.includes("\u0000"))
    throw new Error("Save the CSV file with UTF-8 encoding and try again.");
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += char;
        if (char === "\n" || (char === "\r" && content[index + 1] !== "\n"))
          line++;
      }
      continue;
    }
    if (char === ",") {
      finishField();
      continue;
    }
    if (char === "\n" || char === "\r") {
      finishRow();
      if (char === "\r" && content[index + 1] === "\n") index++;
      line++;
      rowStart = line;
      continue;
    }
    if (closedQuote) {
      if (char === " " || char === "\t") continue;
      throw new Error(
        `Line ${line}: unexpected text after a quoted CSV value.`,
      );
    }
    if (char === '"') {
      if (field)
        throw new Error(
          `Line ${line}: a CSV quote must start at the beginning of a field.`,
        );
      quoted = true;
    } else field += char;
  }
  if (quoted)
    throw new Error(`Line ${rowStart}: a quoted CSV value is not closed.`);
  if (field || values.length || closedQuote) finishRow();
  return source;
}

export async function readAssetImportFile(
  file: File,
): Promise<AssetImportFile> {
  if (!/\.(csv|xlsx)$/i.test(file.name))
    throw new Error("Choose a CSV or Excel (.xlsx) file.");
  if (!file.size)
    throw new Error(
      "This file is empty. Add column headers and at least one asset.",
    );
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error("The file is too large. Upload a file up to 5 MB.");
  if (/\.csv$/i.test(file.name))
    return finishFile(file.name, "CSV", readCsv(await file.text()));
  const XLSX = await import("xlsx");
  let workbook: WorkBook;
  let sheetName: string;
  try {
    const buffer = await file.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
    if (
      signature[0] !== 0x50 ||
      signature[1] !== 0x4b ||
      signature[2] !== 0x03 ||
      signature[3] !== 0x04
    )
      throw new Error("Invalid workbook signature");
    const metadata = XLSX.read(buffer, { type: "array", bookSheets: true });
    sheetName = metadata.SheetNames.includes("Assets")
      ? "Assets"
      : metadata.SheetNames[0];
    if (!sheetName) throw new Error("No worksheets found");
    workbook = XLSX.read(buffer, {
      type: "array",
      sheets: sheetName,
      sheetRows: MAX_WORKSHEET_ROWS + 1,
      cellFormula: true,
      cellDates: false,
      cellText: true,
    });
  } catch {
    throw new Error(
      "Could not read this Excel file. Save an unprotected Excel Workbook (.xlsx) and try again.",
    );
  }
  const sheet = workbook.Sheets[sheetName];
  const reference = sheet?.["!fullref"] ?? sheet?.["!ref"];
  if (
    typeof reference !== "string" ||
    !/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(reference)
  )
    throw new Error(
      "The selected worksheet is empty or has an invalid cell range.",
    );
  const range = XLSX.utils.decode_range(reference);
  if (
    !Number.isSafeInteger(range.e.r) ||
    range.e.r >= MAX_WORKSHEET_ROWS ||
    range.s.r < 0
  )
    throw new Error(
      `Keep your data within the first ${MAX_WORKSHEET_ROWS} worksheet rows and remove extra blank rows.`,
    );
  if (
    !Number.isSafeInteger(range.e.c) ||
    range.e.c >= MAX_IMPORT_COLUMNS ||
    range.s.c < 0
  )
    throw new Error(
      `Upload up to ${MAX_IMPORT_COLUMNS} source columns at a time.`,
    );
  const source: SourceRow[] = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
    const cells = Array.from(
      { length: range.e.c + 1 },
      (_, column) =>
        sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })] as
          | CellObject
          | undefined,
    );
    if (!cells.some(occupied)) continue;
    source.push({ rowNumber: rowIndex + 1, cells });
    if (source.length > MAX_IMPORT_ROWS + 1)
      throw new Error(`Upload up to ${MAX_IMPORT_ROWS} assets at a time.`);
  }
  return finishFile(
    file.name,
    sheetName,
    source,
    !!workbook.Workbook?.WBProps?.date1904,
  );
}

const normalizeHeader = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");
const HEADER_ALIASES: Record<string, string> = {
  name: "name",
  equipmentname: "name",
  machinename: "name",
  asset: "name",
  level: "level",
  hierarchylevel: "level",
  equipmentlevel: "level",
  code: "code",
  assetnumber: "code",
  equipmentcode: "code",
  machinecode: "code",
  equipmentcategory: "category",
  assetcategory: "category",
  type: "category",
  location: "location",
  workplace: "location",
  gemba: "location",
  area: "location",
  team: "team",
  maintenanceteamname: "team",
  owner: "maintenanceOwner",
  responsibleperson: "maintenanceOwner",
  employeecode: "operatorId",
  operatorcode: "operatorId",
  primaryoperator: "operatorId",
  parentcode: "parentId",
  parent: "parentId",
  usage: "usage",
  condition: "health",
  operating: "operating",
  impact: "economicImpact",
  installationdate: "installedOn",
  installedon: "installedOn",
  warrantyuntil: "warrantyUntil",
  serial: "serialNumber",
  serialno: "serialNumber",
};

export function suggestAssetColumnMapping(
  file: AssetImportFile,
): AssetColumnMapping {
  const known = new Map(
    ASSET_IMPORT_COLUMNS.map((column) => [
      normalizeHeader(column.header),
      column.key as string,
    ]),
  );
  const used = new Set<string>();
  const mapping: AssetColumnMapping = {};
  file.headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const field = known.get(normalized) ?? HEADER_ALIASES[normalized];
    if (!field || used.has(field)) return;
    mapping[index] = field;
    used.add(field);
  });
  return mapping;
}

export async function validateMappedAssets(
  file: AssetImportFile,
  mapping: AssetColumnMapping,
  assets: Asset[],
  operators: ImportOperator[],
): Promise<AssetImportResult> {
  const issues: AssetImportIssue[] = [];
  const fields = new Map(
    ASSET_IMPORT_COLUMNS.map((column, index) => [column.key as string, index]),
  );
  const selected = new Set<string>();
  file.headers.forEach((header, index) => {
    const target = mapping[index];
    if (target === undefined) {
      if (header.trim() || file.rows.some((row) => occupied(row.cells[index])))
        issues.push({
          field: header || `Column ${index + 1}`,
          message:
            "Match this column to an asset field or explicitly choose Skip column.",
        });
      return;
    }
    if (target === "") return;
    if (!fields.has(target)) {
      issues.push({
        field: header || `Column ${index + 1}`,
        message: "Choose a valid asset field for this column.",
      });
      return;
    }
    if (selected.has(target))
      issues.push({
        field: ASSET_IMPORT_COLUMNS[fields.get(target)!].header,
        message: "Match each asset field to only one source column.",
      });
    selected.add(target);
  });
  for (const column of ASSET_IMPORT_COLUMNS)
    if (column.required && !selected.has(column.key))
      issues.push({
        field: column.header,
        message: "Match a source column to this required asset field.",
      });
  if (!selected.has("team") && !selected.has("maintenanceOwner"))
    issues.push({
      field: "Maintenance team / Maintenance owner",
      message:
        "Match at least one column to Maintenance team or Maintenance owner.",
    });
  for (const row of file.rows)
    if (
      !row.cells.some(
        (cell, index) => fields.has(mapping[index]) && occupied(cell),
      )
    )
      issues.push({
        rowNumber: row.rowNumber,
        message:
          "This row has no asset values after skipped columns are removed. Fill its asset fields or remove the row from your file.",
      });
  if (!file.rows.length)
    issues.push({
      message:
        "No assets found. Add at least one asset below the column headers.",
    });
  if (file.rows.length > MAX_IMPORT_ROWS)
    issues.push({
      message: `Upload up to ${MAX_IMPORT_ROWS} assets at a time.`,
    });
  if (file.headers.length > MAX_IMPORT_COLUMNS)
    issues.push({
      message: `Upload up to ${MAX_IMPORT_COLUMNS} source columns at a time.`,
    });
  if (issues.length) return { rows: [], issues, totalRows: file.rows.length };
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ASSET_IMPORT_COLUMNS.map((column) => column.header),
  ]);
  file.rows.forEach((row, rowIndex) => {
    file.headers.forEach((_, columnIndex) => {
      const targetIndex = fields.get(mapping[columnIndex]);
      const cell = row.cells[columnIndex];
      if (targetIndex === undefined || !cell) return;
      sheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: targetIndex })] = {
        ...cell,
      };
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: file.rows.length, c: ASSET_IMPORT_COLUMNS.length - 1 },
  });
  workbook.Workbook = { WBProps: { date1904: file.date1904 } };
  XLSX.utils.book_append_sheet(workbook, sheet, "Assets");
  const normalized = new File(
    [
      XLSX.write(workbook, {
        type: "array",
        bookType: "xlsx",
        compression: true,
      }),
    ],
    "mapped-assets.xlsx",
  );
  const result = await parseAssetWorkbook(normalized, assets, operators);
  const sourceRow = (row: number) => file.rows[row - 2]?.rowNumber ?? row;
  return {
    totalRows: file.rows.length,
    rows: result.rows.map((row) => ({
      ...row,
      rowNumber: sourceRow(row.rowNumber),
    })),
    issues: result.issues.map((issue) => ({
      ...issue,
      rowNumber:
        issue.rowNumber === undefined ? undefined : sourceRow(issue.rowNumber),
      message: issue.message.replace(
        /\brow (\d+)\b/g,
        (_, row: string) => `row ${sourceRow(Number(row))}`,
      ),
    })),
  };
}
