import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  readAssetImportFile,
  suggestAssetColumnMapping,
  validateMappedAssets,
  type AssetColumnMapping,
} from "../components/tpm/asset-import-file";
import {
  MAX_IMPORT_BYTES,
  createAssetTemplate,
  prepareAssetImport,
} from "../components/tpm/asset-import";
import { sampleAssets } from "../components/tpm/asset-preview";

const assets = sampleAssets();
const operators = [
  { id: "member-1", name: "Asha", label: "Asha", code: "EMP-001" },
];
const csv = (value: string) => new File([value], "assets.csv");
const headers = "Name,Category,Location,Team";
const row = "Pump,Key utility equipment,Utilities,Mechanical";
function excelFile(sheets: Record<string, XLSX.WorkSheet>, date1904 = false) {
  const workbook = XLSX.utils.book_new();
  for (const [name, sheet] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  workbook.Workbook = { WBProps: { date1904 } };
  return new File(
    [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
    "assets.xlsx",
  );
}

test("CSV supports BOM, escaped quotes, commas, multiline text and leading-zero codes", async () => {
  const file = await readAssetImportFile(
    csv(
      '\uFEFFName,Code,Category,Location,Team,Notes\r\n"Pump, ""north""",00012,Key utility equipment,Utilities,Mechanical,"First line\r\nSecond line"\r\n',
    ),
  );
  assert.equal(file.rows[0].values[0], 'Pump, "north"');
  assert.equal(file.rows[0].values[1], "00012");
  assert.equal(file.rows[0].values[5], "First line\r\nSecond line");
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].input.code, "00012");
  assert.equal(result.rows[0].input.notes, "First line\r\nSecond line");
});

test("CSV empty rows and quoted newlines retain source line numbers for validation", async () => {
  const file = await readAssetImportFile(
    csv(
      `${headers},Notes\n\n${row},"one\ntwo"\nPump,Key utility equipment,,Mechanical,Missing location\n`,
    ),
  );
  assert.deepEqual(
    file.rows.map((item) => item.rowNumber),
    [3, 5],
  );
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 5 && issue.field === "Workplace / Gemba",
    ),
  );
});

test("malformed CSV quotes fail with a useful source line", async () => {
  for (const value of [
    `${headers}\n"Pump,Key utility equipment,Utilities,Mechanical`,
    `${headers}\n"Pump"oops,Key utility equipment,Utilities,Mechanical`,
    `${headers}\nPu"mp,Key utility equipment,Utilities,Mechanical`,
  ])
    await assert.rejects(() => readAssetImportFile(csv(value)), /Line 2/);
});

test("mapping aliases handle reordered fields and missing optional fields keep defaults", async () => {
  const file = await readAssetImportFile(
    csv(
      "Area,Owner,Machine name,Equipment category,Employee code\nUtilities,Asha,Pump,Key utility equipment,EMP-001",
    ),
  );
  const mapping = suggestAssetColumnMapping(file);
  assert.deepEqual(mapping, {
    0: "location",
    1: "maintenanceOwner",
    2: "name",
    3: "category",
    4: "operatorId",
  });
  const result = await validateMappedAssets(file, mapping, assets, operators);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].input.code, "");
  assert.equal(result.rows[0].input.operatorId, "member-1");
  assert.equal(result.rows[0].input.usage, "Active");
  assert.equal(prepareAssetImport(result.rows, assets)[0].code, "AST-0009");
});

test("mapped CSV accepts full unscored labels and existing short values without changing stored enums", async () => {
  const file = await readAssetImportFile(
    csv(
      [
        `${headers},Usage status,Health,Economic impact,Criticality`,
        `${row}, Active - Regularly   Used , very good , Operational Value Adding (OPVA) , A  - High Criticality: First Priority `,
        `${row},Active,Very Good,Operational value adding,A`,
      ].join("\n"),
    ),
  );
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 2);
  for (const imported of prepareAssetImport(result.rows, assets)) {
    assert.equal(imported.usage, "Active");
    assert.equal(imported.health, "Very Good");
    assert.equal(imported.economicImpact, "Operational value adding");
    assert.equal(imported.criticality, "A");
  }
});

test("source columns must be mapped or intentionally skipped", async () => {
  const file = await readAssetImportFile(
    csv(`${headers},Unrelated info\n${row},Old description`),
  );
  const mapping = suggestAssetColumnMapping(file);
  assert.equal(mapping[4], undefined);
  const unmatched = await validateMappedAssets(
    file,
    mapping,
    assets,
    operators,
  );
  assert.ok(
    unmatched.issues.some(
      (issue) =>
        issue.field === "Unrelated info" && /Skip column/.test(issue.message),
    ),
  );
  const skipped = await validateMappedAssets(
    file,
    { ...mapping, 4: "" },
    assets,
    operators,
  );
  assert.deepEqual(skipped.issues, []);
  assert.equal(skipped.rows.length, 1);
});

test("duplicate source headers retain indices and cannot both target one asset field", async () => {
  const file = await readAssetImportFile(
    csv(`${headers},Name\n${row},Other name`),
  );
  const mapping = suggestAssetColumnMapping(file);
  assert.equal(file.headers[0], "Name");
  assert.equal(file.headers[4], "Name");
  assert.equal(mapping[4], undefined);
  const duplicate = await validateMappedAssets(
    file,
    { ...mapping, 4: "name" },
    assets,
    operators,
  );
  assert.ok(
    duplicate.issues.some((issue) =>
      /only one source column/.test(issue.message),
    ),
  );
  assert.deepEqual(
    (await validateMappedAssets(file, { ...mapping, 4: "" }, assets, operators))
      .issues,
    [],
  );
});

test("mapping requires name, category, location and maintenance responsibility", async () => {
  const file = await readAssetImportFile(csv(`${headers}\n${row}`));
  const issues = (
    await validateMappedAssets(
      file,
      { 0: "", 1: "", 2: "", 3: "" },
      assets,
      operators,
    )
  ).issues;
  for (const field of [
    "Asset name",
    "Category",
    "Workplace / Gemba",
    "Maintenance team / Maintenance owner",
  ])
    assert.ok(issues.some((issue) => issue.field === field));
  const invalid: AssetColumnMapping = {
    ...suggestAssetColumnMapping(file),
    0: "notAField",
  };
  assert.ok(
    (await validateMappedAssets(file, invalid, assets, operators)).issues.some(
      (issue) => /valid asset field/.test(issue.message),
    ),
  );
});

test("rows containing values only in skipped columns cannot disappear silently", async () => {
  const file = await readAssetImportFile(
    csv(`${headers},Extra\n${row},\n,,,,Has data`),
  );
  const result = await validateMappedAssets(
    file,
    { ...suggestAssetColumnMapping(file), 4: "" },
    assets,
    operators,
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 3 && /no asset values/.test(issue.message),
    ),
  );
});

test("Excel chooses Assets when present and otherwise imports the first worksheet", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([headers.split(","), row.split(",")]);
  const preferred = await readAssetImportFile(
    excelFile({
      Guide: XLSX.utils.aoa_to_sheet([["Instructions"]]),
      Assets: sheet,
    }),
  );
  assert.equal(preferred.sheetName, "Assets");
  const first = await readAssetImportFile(
    excelFile({ Machines: sheet, Other: XLSX.utils.aoa_to_sheet([["Other"]]) }),
  );
  assert.equal(first.sheetName, "Machines");
  assert.deepEqual(
    (
      await validateMappedAssets(
        first,
        suggestAssetColumnMapping(first),
        assets,
        operators,
      )
    ).issues,
    [],
  );
});

test("Excel formulas and cell errors remain errors after mapping", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    headers.split(","),
    row.split(","),
    row.split(","),
  ]);
  sheet.A2 = { t: "s", v: "Cached name", f: '"Cached name"' };
  sheet.C3 = { t: "e", v: 0x07 };
  const file = await readAssetImportFile(excelFile({ Equipment: sheet }));
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 2 && /Formulas/.test(issue.message),
    ),
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 3 && /Excel error/.test(issue.message),
    ),
  );
});

test("Excel dates preserve their workbook epoch and source row numbers", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    headers.split(",").concat("Installation date"),
    [],
    row.split(",").concat("44575"),
  ]);
  sheet.E3 = { t: "n", v: 44575, z: "yyyy-mm-dd" };
  const file = await readAssetImportFile(excelFile({ Assets: sheet }, true));
  assert.equal(file.rows[0].rowNumber, 3);
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].rowNumber, 3);
  assert.equal(result.rows[0].input.installedOn, "2026-01-15");
});

test("duplicate code errors mention original source rows", async () => {
  const file = await readAssetImportFile(
    csv(`${headers},Code\n\n${row},NEW-1\n\n${row},NEW-1`),
  );
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 5 && /row 3/.test(issue.message),
    ),
  );
});

test("CSV formula-looking strings remain literal text", async () => {
  const file = await readAssetImportFile(
    csv(`${headers}\n=Pump,Key utility equipment,Utilities,Mechanical`),
  );
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].input.name, "=Pump");
});

test("sample template maps and validates its hierarchy and automatic code without manual assignments", async () => {
  const workbook = await createAssetTemplate("sample");
  const file = await readAssetImportFile(
    new File(
      [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
      "template.xlsx",
    ),
  );
  assert.equal(file.headers.length, 26);
  assert.equal(file.rows.length, 3, "Header notes do not become import rows");
  assert.deepEqual(
    file.rows.map((row) => row.rowNumber),
    [2, 3, 4],
  );
  assert.equal(Object.keys(suggestAssetColumnMapping(file)).length, 26);
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.deepEqual(result.issues, []);
  const imported = prepareAssetImport(result.rows, assets);
  assert.equal(imported[0].code, "SAMPLE-IMM-001");
  assert.equal(imported[1].parentId, imported[0].id);
  assert.equal(imported[1].level, "Component");
  assert.equal(imported[2].code, "AST-0009");
});

test("empty template notes are not rows and filling it produces a valid mapped import", async () => {
  const workbook = await createAssetTemplate();
  const sheet = workbook.Sheets.Assets;
  await assert.rejects(
    () => readAssetImportFile(excelFile({ Assets: sheet })),
    /No assets found/,
  );
  const templateHeaders = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
  })[0];
  const values: Record<string, string> = {
    "Asset name": "Material dryer",
    Category: "Auxiliary equipment",
    "Workplace / Gemba": "Material preparation",
    "Maintenance team": "Mechanical",
  };
  XLSX.utils.sheet_add_aoa(
    sheet,
    [templateHeaders.map((header) => values[header] ?? "")],
    { origin: "A2" },
  );
  const file = await readAssetImportFile(excelFile({ Assets: sheet }));
  assert.equal(file.rows.length, 1);
  assert.equal(file.rows[0].rowNumber, 2);
  const result = await validateMappedAssets(
    file,
    suggestAssetColumnMapping(file),
    assets,
    operators,
  );
  assert.deepEqual(result.issues, []);
  assert.equal(prepareAssetImport(result.rows, assets)[0].code, "AST-0009");
});

test("mapped CSV supports optional level aliases and parent codes across hierarchy levels", async () => {
  const file = await readAssetImportFile(
    csv(
      `${headers},Code,Hierarchy level,Parent code\n${row},MACHINE-1,equipment,LINE-1\nLine,Production equipment,Production,Mechanical,LINE-1,line,PLANT-1\nPlant,Production equipment,Main plant,Mechanical,PLANT-1,plant,`,
    ),
  );
  const mapping = suggestAssetColumnMapping(file);
  assert.equal(mapping[5], "level");
  assert.equal(mapping[6], "parentId");
  const result = await validateMappedAssets(file, mapping, assets, operators);
  assert.deepEqual(result.issues, []);
  const created = prepareAssetImport(result.rows, assets);
  assert.deepEqual(
    created.map((asset) => asset.level),
    ["Equipment", "Line", "Plant"],
  );
  assert.equal(created[0].parentId, created[1].id);
  assert.equal(created[1].parentId, created[2].id);
});

test("file bounds, empty files and malformed workbooks fail before mapping", async () => {
  await assert.rejects(
    () => readAssetImportFile(new File(["bad"], "assets.xlsx")),
    /Could not read/,
  );
  await assert.rejects(
    () => readAssetImportFile(new File(["bad"], "assets.xls")),
    /CSV or Excel/,
  );
  await assert.rejects(() => readAssetImportFile(csv("")), /empty/);
  await assert.rejects(
    () => readAssetImportFile(csv(headers)),
    /No assets found/,
  );
  await assert.rejects(
    () =>
      readAssetImportFile(
        new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], "assets.csv"),
      ),
    /too large/,
  );
  await assert.rejects(
    () =>
      readAssetImportFile(
        csv(`${headers}\n${Array.from({ length: 501 }, () => row).join("\n")}`),
      ),
    /up to 500/,
  );
  await assert.rejects(
    () =>
      readAssetImportFile(
        csv(
          `${Array.from({ length: 101 }, (_, index) => `Column ${index}`).join(",")}\n${row}`,
        ),
      ),
    /up to 100/,
  );
});
