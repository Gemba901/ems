import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import {
  ASSET_IMPORT_COLUMNS,
  ASSET_TEMPLATE_SAMPLE_ROWS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  createAssetTemplate,
  parseAssetWorkbook,
  prepareAssetImport,
  type ImportOperator,
} from "../components/tpm/asset-import";
import { sampleAssets } from "../components/tpm/asset-preview";
import { assetOptionLabel } from "../components/tpm/asset-option-labels";

const operators: ImportOperator[] = [
  {
    id: "member-1",
    name: "Asha",
    label: "Asha · Maintenance",
    code: "EMP-001",
  },
];
const current = sampleAssets();
type Values = Record<string, string | number | Date>;
const validRow = (overrides: Values = {}): Values => ({
  "Asset code": "NEW-001",
  "Asset name": "New pump",
  Category: "Key utility equipment",
  "Workplace / Gemba": "Utilities room",
  "Maintenance team": "Mechanical",
  ...overrides,
});
async function workbookWith(rows: Values[] = []) {
  const workbook = await createAssetTemplate("empty");
  const headers = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Assets, {
    header: 1,
  })[0];
  workbook.Sheets.Assets = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ]);
  return workbook;
}
function file(workbook: XLSX.WorkBook, name = "assets.xlsx") {
  return new File(
    [XLSX.write(workbook, { type: "array", bookType: "xlsx" })],
    name,
  );
}
const parse = (workbook: XLSX.WorkBook) =>
  parseAssetWorkbook(file(workbook), current, operators);

test("sample template contains three valid plastics assets with a parent link and an automatic code", async () => {
  const workbook = await createAssetTemplate("sample");
  assert.deepEqual(workbook.SheetNames, ["Assets"]);
  assert.equal(XLSX.utils.decode_range(workbook.Sheets.Assets["!ref"]!).e.r, 3);
  const result = await parse(workbook);
  assert.deepEqual(result.issues, []);
  assert.equal(result.totalRows, 3);
  assert.deepEqual(
    result.rows.map((row) => row.input.name),
    ["Injection moulding machine", "Hydraulic pump", "Material dryer"],
  );
  assert.deepEqual(
    result.rows.map((row) => row.input.code),
    ["SAMPLE-IMM-001", "SAMPLE-PUMP-001", ""],
  );
  assert.deepEqual(
    result.rows.map((row) => row.input.level),
    ["Equipment", "Component", "Equipment"],
  );
  assert.ok(result.rows.every((row) => row.input.operatorId === ""));
  assert.equal(ASSET_TEMPLATE_SAMPLE_ROWS[1].parentId, "SAMPLE-IMM-001");
  assert.equal(
    result.rows[1].parentCode,
    ASSET_TEMPLATE_SAMPLE_ROWS[1].parentId,
  );
  const imported = prepareAssetImport(result.rows, current);
  assert.equal(imported[1].parentId, imported[0].id);
  assert.equal(imported[2].code, "AST-0009");
  assert.equal(
    result.rows[2].input.code,
    "",
    "Preparing does not rewrite the sample's blank code",
  );
});

test("default template has only headers and accepts filled asset rows", async () => {
  const workbook = await createAssetTemplate();
  const sheet = workbook.Sheets.Assets;
  const headers = ASSET_IMPORT_COLUMNS.map((column) => column.header);
  assert.deepEqual(workbook.SheetNames, ["Assets"]);
  assert.deepEqual(XLSX.utils.sheet_to_json(sheet, { header: 1 }), [headers]);
  assert.equal(XLSX.utils.sheet_to_json(sheet).length, 0);
  const empty = await parse(workbook);
  assert.equal(empty.totalRows, 0);
  assert.match(empty.issues[0].message, /No assets found/);
  const values = validRow({
    "Asset code": "",
    "Asset name": "Filled template dryer",
  });
  XLSX.utils.sheet_add_aoa(
    sheet,
    [headers.map((header) => values[header] ?? "")],
    { origin: "A2" },
  );
  const result = await parse(workbook);
  assert.deepEqual(result.issues, []);
  assert.equal(result.totalRows, 1);
  assert.equal(prepareAssetImport(result.rows, current)[0].code, "AST-0009");
});

test("both templates preserve field guidance in Excel header notes without adding data rows", async () => {
  for (const variant of ["sample", "empty"] as const) {
    const workbook = await createAssetTemplate(variant);
    const restored = XLSX.read(await file(workbook).arrayBuffer(), {
      type: "array",
    });
    const sheet = restored.Sheets.Assets;
    assert.deepEqual(restored.SheetNames, ["Assets"]);
    assert.equal(
      XLSX.utils.sheet_to_json(sheet).length,
      variant === "sample" ? 3 : 0,
    );
    assert.equal(
      XLSX.utils.decode_range(sheet["!ref"]!).e.c,
      ASSET_IMPORT_COLUMNS.length - 1,
    );
    ASSET_IMPORT_COLUMNS.forEach((column, index) => {
      const cell = sheet[
        XLSX.utils.encode_cell({ r: 0, c: index })
      ] as XLSX.CellObject;
      assert.equal(cell.v, column.header);
      assert.equal(cell.c?.length, 1);
      const note = cell.c![0].t;
      assert.ok(
        note.includes(column.help),
        `${column.header} retains its field guidance`,
      );
      if (column.values) {
        assert.match(note, /Allowed values:/);
        for (const value of column.values)
          assert.ok(note.includes(assetOptionLabel(column.key, value)));
        assert.doesNotMatch(
          note,
          / - \d+\b/,
          "Field guidance does not display numeric ratings",
        );
      }
    });
    const instructions = sheet.A1.c![0].t;
    assert.match(instructions, /headers unchanged/);
    assert.match(instructions, /one asset per row/);
    assert.match(instructions, /Fill Asset name, Category, Workplace/);
    assert.doesNotMatch(instructions, /sample rows/i);
  }
});

test("Excel accepts full unscored option names and legacy values with canonical storage", async () => {
  const result = await parse(
    await workbookWith([
      validRow({
        "Asset code": "FULL-NAMES",
        "Usage status": "  active - regularly   used  ",
        Health: "  VERY   GOOD ",
        "Economic impact": "high   value contribution",
        Criticality: " A  -  High Criticality: First Priority ",
      }),
      validRow({
        "Asset code": "LEGACY-NAMES",
        "Usage status": "Active",
        Health: "Very Good",
        "Economic impact": "High",
        Criticality: "A",
      }),
      validRow({
        "Asset code": "PREVIOUS-TEMPLATE",
        "Usage status": "Active Equipment",
        Health: "Very Good",
        "Economic impact": "High",
        Criticality: "A",
      }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  for (const imported of prepareAssetImport(result.rows, current)) {
    assert.equal(imported.usage, "Active");
    assert.equal(imported.health, "Very Good");
    assert.equal(imported.economicImpact, "High");
    assert.equal(imported.criticality, "A");
  }
});

test("invalid choices show full unscored names in errors and template notes", async () => {
  const result = await parse(
    await workbookWith([
      validRow({
        "Usage status": "Active Equipment (unknown)",
        Health: "Unknown condition",
        "Economic impact": "Unknown impact",
        Criticality: "High",
      }),
    ]),
  );
  const workbook = await createAssetTemplate();
  const expected: Record<string, string> = {
    "Usage status": "Active - Regularly Used",
    Health: "Very Good",
    "Economic impact": "Operational Value Adding (OPVA)",
    Criticality: "A - High Criticality: First Priority",
  };
  for (const [header, label] of Object.entries(expected)) {
    const issue = result.issues.find((item) => item.field === header);
    assert.ok(issue, `${header} rejects unrecognized choices`);
    assert.ok(issue.message.includes(label));
    assert.doesNotMatch(issue.message, / - \d+\b/);
    const column = ASSET_IMPORT_COLUMNS.findIndex(
      (item) => item.header === header,
    );
    const note =
      workbook.Sheets.Assets[XLSX.utils.encode_cell({ r: 0, c: column })].c![0]
        .t;
    assert.ok(note.includes(label));
    assert.doesNotMatch(note, / - \d+\b/);
  }
});

test("legacy 25-column templates without Asset level remain valid", async () => {
  const workbook = await workbookWith([validRow()]);
  const data = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Assets, {
    header: 1,
  });
  const levelIndex = data[0].indexOf("Asset level");
  workbook.Sheets.Assets = XLSX.utils.aoa_to_sheet(
    data.map((row) => row.filter((_, index) => index !== levelIndex)),
  );
  assert.equal(
    XLSX.utils.decode_range(workbook.Sheets.Assets["!ref"]!).e.c,
    24,
  );
  const result = await parse(workbook);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].input.level, "Equipment");
  assert.equal(prepareAssetImport(result.rows, current)[0].level, "Equipment");
});

test("asset levels canonicalize enum values, default blanks and reject unknown values", async () => {
  const valid = await parse(
    await workbookWith([
      validRow({ "Asset code": "LEVEL-1", "Asset level": " pLaNt " }),
      validRow({ "Asset code": "LEVEL-2", "Asset level": "" }),
      validRow({ "Asset code": "LEVEL-3", "Asset level": "component" }),
    ]),
  );
  assert.deepEqual(valid.issues, []);
  assert.deepEqual(
    valid.rows.map((row) => row.input.level),
    ["Plant", "Equipment", "Component"],
  );
  const invalid = await parse(
    await workbookWith([validRow({ "Asset level": "Factory" })]),
  );
  assert.ok(
    invalid.issues.some(
      (issue) => issue.rowNumber === 2 && issue.field === "Asset level",
    ),
  );
});

test("three hierarchy levels resolve forward parent references within one upload", async () => {
  const result = await parse(
    await workbookWith([
      validRow({
        "Asset code": "PUMP-1",
        "Asset level": "Equipment",
        "Parent asset code": "LINE-1",
      }),
      validRow({
        "Asset code": "LINE-1",
        "Asset level": "Line",
        "Parent asset code": "PLANT-1",
      }),
      validRow({ "Asset code": "PLANT-1", "Asset level": "Plant" }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  const imported = prepareAssetImport(result.rows, current);
  assert.deepEqual(
    imported.map((asset) => asset.level),
    ["Equipment", "Line", "Plant"],
  );
  assert.equal(imported[0].parentId, imported[1].id);
  assert.equal(imported[1].parentId, imported[2].id);
  assert.equal(imported[2].parentId, "");
});

test("parent links define hierarchy without enforcing a fixed level order", async () => {
  const result = await parse(
    await workbookWith([
      validRow({
        "Asset code": "CHILD-PLANT",
        "Asset level": "Plant",
        "Parent asset code": "PARENT-STATION",
      }),
      validRow({
        "Asset code": "PARENT-STATION",
        "Asset level": "Station",
        "Parent asset code": current[0].code,
      }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  const imported = prepareAssetImport(result.rows, current);
  assert.equal(imported[0].parentId, imported[1].id);
  assert.equal(imported[1].parentId, current[0].id);
});

test("a header-only template prompts the user to add assets", async () => {
  const result = await parse(await workbookWith());
  assert.equal(result.totalRows, 0);
  assert.match(result.issues[0].message, /No assets found/);
});

test("imports defaults, trims/canonicalizes enum choices and resolves current-org operators", async () => {
  const result = await parse(
    await workbookWith([
      validRow({
        "Asset code": "  NEW-001  ",
        Category: "key UTILITY equipment",
        "Usage status": "active",
        Criticality: "a",
        "Primary operator code": " emp-001 ",
      }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].input.code, "NEW-001");
  assert.equal(result.rows[0].input.category, "Key utility equipment");
  assert.equal(result.rows[0].input.criticality, "A");
  assert.equal(result.rows[0].input.stage, "Registered");
  assert.equal(result.rows[0].input.operating, "Operational");
  assert.equal(result.rows[0].input.operator, "Asha");
  assert.equal(result.rows[0].input.operatorId, "member-1");
});

test("blank codes are generated sequentially without changing parsed inputs", async () => {
  const result = await parse(
    await workbookWith([
      validRow({ "Asset code": "" }),
      validRow({ "Asset code": " " }),
      validRow({ "Asset code": "" }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  assert.deepEqual(
    result.rows.map((row) => row.input.code),
    ["", "", ""],
  );
  const snapshot = JSON.stringify(result.rows);
  const created = prepareAssetImport(result.rows, current);
  assert.deepEqual(
    created.map((asset) => asset.code),
    ["AST-0009", "AST-0010", "AST-0011"],
  );
  assert.equal(JSON.stringify(result.rows), snapshot);
});

test("all explicit batch codes are reserved before any blank code is allocated", async () => {
  const result = await parse(
    await workbookWith([
      validRow({ "Asset code": "" }),
      validRow({ "Asset code": "ast-0009" }),
      validRow({ "Asset code": "" }),
      validRow({ "Asset code": "AST-0010" }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  assert.deepEqual(
    prepareAssetImport(result.rows, current).map((asset) => asset.code),
    ["AST-0011", "ast-0009", "AST-0012", "AST-0010"],
  );
});

test("blank codes are recalculated against fresh assets at every commit", async () => {
  const result = await parse(
    await workbookWith([validRow({ "Asset code": "" })]),
  );
  assert.deepEqual(result.issues, []);
  const first = prepareAssetImport(result.rows, current);
  const second = prepareAssetImport(result.rows, [...first, ...current]);
  assert.equal(first[0].code, "AST-0009");
  assert.equal(second[0].code, "AST-0010");
  assert.equal(result.rows[0].input.code, "");
});

test("large numeric code suffixes do not overflow or collide", async () => {
  const result = await parse(
    await workbookWith([
      validRow({ "Asset code": "" }),
      validRow({ "Asset code": "AST-9007199254740992" }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  assert.equal(
    prepareAssetImport(result.rows, current)[0].code,
    "AST-9007199254740993",
  );
});

test("parent references cannot guess auto-generated codes but explicit parents still work", async () => {
  const guessed = await parse(
    await workbookWith([
      validRow({ "Asset code": "" }),
      validRow({ "Asset code": "CHILD", "Parent asset code": "AST-0009" }),
    ]),
  );
  assert.ok(
    guessed.issues.some(
      (issue) => issue.rowNumber === 3 && issue.field === "Parent asset code",
    ),
  );
  assert.throws(
    () => prepareAssetImport(guessed.rows, current),
    /No asset with this code/,
  );
  const explicit = await parse(
    await workbookWith([
      validRow({ "Asset code": "", "Parent asset code": "PARENT" }),
      validRow({ "Asset code": "PARENT" }),
    ]),
  );
  assert.deepEqual(explicit.issues, []);
  const created = prepareAssetImport(explicit.rows, current);
  assert.equal(created[0].parentId, created[1].id);
});

test("operator codes reject unknown values and internal IDs; missing codes stay optional", async () => {
  for (const code of ["OTHER-ORG-001", "member-1"]) {
    const result = await parse(
      await workbookWith([validRow({ "Primary operator code": code })]),
    );
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.field === "Primary operator code" &&
          /employee code/.test(issue.message),
      ),
    );
  }
  const blank = await parseAssetWorkbook(
    file(await workbookWith([validRow()])),
    current,
    [],
  );
  assert.deepEqual(blank.issues, []);
  assert.equal(blank.rows[0].input.operatorId, "");
  const noCode = await parseAssetWorkbook(
    file(
      await workbookWith([validRow({ "Primary operator code": "member-2" })]),
    ),
    current,
    [{ id: "member-2", name: "Ravi", label: "Ravi" }],
  );
  assert.ok(
    noCode.issues.some((issue) => issue.field === "Primary operator code"),
  );
});

test("ambiguous employee codes fail instead of choosing an arbitrary member", async () => {
  const result = await parseAssetWorkbook(
    file(
      await workbookWith([validRow({ "Primary operator code": "EMP-001" })]),
    ),
    current,
    [
      ...operators,
      { id: "member-2", name: "Ravi", label: "Ravi", code: "emp-001" },
    ],
  );
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.field === "Primary operator code" &&
        /More than one member/.test(issue.message),
    ),
  );
});

test("legacy operator-ID headers explain how to use the updated template", async () => {
  const workbook = await workbookWith([validRow()]);
  workbook.Sheets.Assets.O1.v = "Primary operator ID";
  const result = await parse(workbook);
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 1 && /latest template/.test(issue.message),
    ),
  );
});

test("blank rows are skipped while errors keep the original worksheet row numbers", async () => {
  const result = await parse(
    await workbookWith([{}, validRow({ "Maintenance team": "" })]),
  );
  assert.equal(result.totalRows, 1);
  assert.equal(result.rows[0].rowNumber, 3);
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 3 && issue.field === "Maintenance team",
    ),
  );
});

test("parent codes resolve across later rows, existing assets and generated final ids", async () => {
  const result = await parse(
    await workbookWith([
      validRow({ "Asset code": "CHILD", "Parent asset code": "parent" }),
      validRow({
        "Asset code": "PARENT",
        "Parent asset code": current[0].code,
      }),
    ]),
  );
  assert.deepEqual(result.issues, []);
  const created = prepareAssetImport(result.rows, current);
  assert.equal(created[0].parentId, created[1].id);
  assert.equal(created[1].parentId, current[0].id);
  assert.notEqual(created[0].id, created[1].id);
  assert.equal(created[0].history.length, 1);
});

test("rejects self parents, cyclic batches and missing parents", async () => {
  for (const rows of [
    [validRow({ "Parent asset code": "NEW-001" })],
    [
      validRow({ "Asset code": "A", "Parent asset code": "B" }),
      validRow({ "Asset code": "B", "Parent asset code": "A" }),
    ],
    [validRow({ "Parent asset code": "DOES-NOT-EXIST" })],
  ]) {
    const result = await parse(await workbookWith(rows));
    assert.ok(
      result.issues.some((issue) => issue.field === "Parent asset code"),
    );
    assert.throws(() => prepareAssetImport(result.rows, current));
  }
});

test("rejects codes that collide with current assets or another batch row", async () => {
  const existing = await parse(
    await workbookWith([
      validRow({ "Asset code": current[0].code.toLowerCase() }),
    ]),
  );
  assert.ok(existing.issues.some((issue) => issue.field === "Asset code"));
  const duplicated = await parse(
    await workbookWith([validRow(), validRow({ "Asset code": "new-001" })]),
  );
  assert.ok(
    duplicated.issues.some(
      (issue) => issue.rowNumber === 3 && /row 2/.test(issue.message),
    ),
  );
});

test("commit preparation rechecks fresh data and leaves existing arrays unchanged on failure", async () => {
  const result = await parse(
    await workbookWith([validRow(), validRow({ "Asset code": "NEW-002" })]),
  );
  assert.deepEqual(result.issues, []);
  const firstImport = prepareAssetImport(result.rows, current);
  const fresh = [...firstImport.slice(1), ...current];
  const snapshot = JSON.stringify(fresh);
  assert.throws(() => prepareAssetImport(result.rows, fresh), /already exists/);
  assert.equal(JSON.stringify(fresh), snapshot);
  assert.throws(() => prepareAssetImport([], fresh), /at least one/);
});

test("validates required fields, lengths, enum values and cross-organization operator codes", async () => {
  const result = await parse(
    await workbookWith([
      validRow({
        "Asset name": " ",
        "Workplace / Gemba": "",
        Description: "x".repeat(4001),
        Model: "x".repeat(201),
        Health: "Excellent",
        "Primary operator code": "other-org-member",
      }),
    ]),
  );
  for (const field of [
    "Asset name",
    "Workplace / Gemba",
    "Description",
    "Model",
    "Health",
    "Primary operator code",
  ])
    assert.ok(
      result.issues.some((issue) => issue.field === field),
      field,
    );
});

test("accepts ISO dates, numeric Excel dates and 1904 workbooks without timezone shifts", async () => {
  const standard = await parse(
    await workbookWith([
      validRow({ "Installation date": "2024-02-29", "Warranty expiry": 46037 }),
    ]),
  );
  assert.deepEqual(standard.issues, []);
  assert.equal(standard.rows[0].input.installedOn, "2024-02-29");
  assert.equal(standard.rows[0].input.warrantyUntil, "2026-01-15");
  const workbook = await workbookWith([
    validRow({ "Installation date": 44575 }),
  ]);
  workbook.Workbook = { WBProps: { date1904: true } };
  const oldEpoch = await parse(workbook);
  assert.deepEqual(oldEpoch.issues, []);
  assert.equal(oldEpoch.rows[0].input.installedOn, "2026-01-15");
});

test("rejects impossible and ambiguous dates, Excel's fake leap date, and inverted warranty dates", async () => {
  for (const value of ["2026-02-29", "2024-04-31", "15/01/2026", 60]) {
    const result = await parse(
      await workbookWith([validRow({ "Installation date": value })]),
    );
    assert.ok(
      result.issues.some((issue) => issue.field === "Installation date"),
      String(value),
    );
  }
  const result = await parse(
    await workbookWith([
      validRow({
        "Installation date": "2026-01-20",
        "Warranty expiry": "2026-01-19",
      }),
    ]),
  );
  assert.ok(result.issues.some((issue) => issue.field === "Warranty expiry"));
});

test("rejects formula cells even with cached values and error cells", async () => {
  const workbook = await workbookWith([
    validRow(),
    validRow({ "Asset code": "NEW-002" }),
  ]);
  workbook.Sheets.Assets.B2 = {
    t: "s",
    v: "Cached asset name",
    f: '"Cached asset name"',
  };
  workbook.Sheets.Assets.D3 = { t: "e", v: 0x07 };
  const result = await parse(workbook);
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.rowNumber === 2 &&
        issue.field === "Asset name" &&
        /Formulas/.test(issue.message),
    ),
  );
  assert.ok(
    result.issues.some(
      (issue) => issue.rowNumber === 3 && /Excel error/.test(issue.message),
    ),
  );
});

test("headers support reordering but reject unknown, duplicate and missing template headers", async () => {
  const reordered = await workbookWith([validRow()]);
  for (const row of [1, 2]) {
    const a = reordered.Sheets.Assets[`A${row}`];
    reordered.Sheets.Assets[`A${row}`] = reordered.Sheets.Assets[`B${row}`];
    reordered.Sheets.Assets[`B${row}`] = a;
  }
  assert.deepEqual((await parse(reordered)).issues, []);
  for (const value of ["Unknown column", "Asset name", ""]) {
    const workbook = await workbookWith([validRow()]);
    workbook.Sheets.Assets.A1.v = value;
    assert.ok(
      (await parse(workbook)).issues.some((issue) => issue.rowNumber === 1),
    );
  }
});

test("rejects oversized ranges, extra columns, wrong sheet names and non-xlsx files", async () => {
  const large = await workbookWith(
    Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) =>
      validRow({ "Asset code": `ROW-${index}` }),
    ),
  );
  assert.match((await parse(large)).issues[0].message, /up to 500/);
  const wide = await workbookWith([validRow()]);
  XLSX.utils.sheet_add_aoa(wide.Sheets.Assets, [["Extra column"]], {
    origin: "AA1",
  });
  assert.match((await parse(wide)).issues[0].message, /template columns/);
  const missing = await workbookWith([validRow()]);
  XLSX.utils.book_append_sheet(
    missing,
    XLSX.utils.aoa_to_sheet([["Other sheet"]]),
    "Other",
  );
  missing.SheetNames = missing.SheetNames.filter((name) => name !== "Assets");
  delete missing.Sheets.Assets;
  assert.match(
    (await parse(missing)).issues[0].message,
    /sheet named "Assets"/,
  );
  assert.match(
    (
      await parseAssetWorkbook(
        new File(["a,b\n1,2"], "assets.xlsx"),
        current,
        operators,
      )
    ).issues[0].message,
    /not a valid/,
  );
  assert.match(
    (
      await parseAssetWorkbook(
        new File(["x"], "assets.csv"),
        current,
        operators,
      )
    ).issues[0].message,
    /\.xlsx/,
  );
  assert.match(
    (await parseAssetWorkbook(new File([], "assets.xlsx"), current, operators))
      .issues[0].message,
    /empty/,
  );
  assert.match(
    (
      await parseAssetWorkbook(
        new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], "assets.xlsx"),
        current,
        operators,
      )
    ).issues[0].message,
    /too large/,
  );
});
