// Rebuild the shared example catalogue from the supplied BEES workbook.
// Usage: node packages/db/scripts/import-planning-library.cjs <workbook.xlsx>
// This reads examples only; it never connects to a database or creates plans.
// Create a NEW data migration to publish future changes; do not edit a migration
// already applied to a database. The frontend receives these records by API.
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("../node_modules/xlsx");

const input = process.argv[2];
if (!input) throw new Error("Pass the BEES SWOT 120 Examples workbook path.");
const workbook = XLSX.readFile(input);
const source = "3.2 - BEES SWOT 120 Examples.xlsx";
const pillarCodes = {
  LEX: "LEX",
  PEX: "PEX",
  OPX: "OPX",
  MEX: "CMX",
  SGX: "SGEX",
  FEX: "FPEX",
};
const categories = {
  Strength: "S",
  Weakness: "W",
  Opportunity: "O",
  Threat: "T",
};
const value = (sheet, row, column) =>
  workbook.Sheets[sheet]?.[`${column}${row}`]?.v ?? null;
const text = (entry) => (entry == null ? "" : String(entry).trim());
const pillar = (code) => {
  if (!pillarCodes[code]) throw new Error(`Unexpected source pillar: ${code}`);
  return pillarCodes[code];
};
const alignment = (entry) =>
  text(entry).startsWith("Other") ? "OTHER" : text(entry).split(" ")[0];
const number = (entry, unit) => {
  if (entry == null || entry === "") return null;
  if (typeof entry !== "number" || !Number.isFinite(entry))
    throw new Error(`Invalid numeric example: ${entry}`);
  return unit === "%" ? Math.round(entry * 100 * 1e10) / 1e10 : entry;
};
const sampleNote =
  "Illustrative workbook example. Replace sample evidence and figures with your organisation's confirmed information before approval.";
const datesNote =
  "The workbook date cell is blank. Review dates in the example wording and choose a deadline for your planning period.";
const direction = (title, baseline, target) => {
  if (/\b(reduce|no more than|at most)\b/i.test(title)) return "LOWER";
  if (/\bmaintain\b/i.test(title) && /\bat least\b/i.test(title))
    return "MAINTAIN_MIN";
  return baseline !== null && target !== null && target < baseline
    ? "LOWER"
    : "HIGHER";
};
const entries = [];
const objectives = new Map();

for (let row = 9; row <= 128; row++) {
  const sheet = "SWOT Register";
  const get = (column) => value(sheet, row, column);
  const code = text(get("A"));
  if (!/^[A-Z]+-[SWOT]\d{2}$/.test(code))
    throw new Error(`Missing finding at row ${row}`);
  const weightage = number(get("J"), "score");
  const area = alignment(get("H"));
  entries.push({
    id: `finding:${code}`,
    kind: "finding",
    title: text(get("D")),
    pillar: pillar(get("B")),
    category: categories[get("C")],
    sourceCode: code,
    sourceSheet: sheet,
    sourceRow: row,
    fields: {
      title: text(get("D")),
      pillar: pillar(get("B")),
      category: categories[get("C")],
      explanation: text(get("E")),
      evidence: text(get("F")),
      impact: text(get("G")),
      alignments: [area],
      alignment: area,
      otherBusinessFocus: text(get("I")),
      weightage,
      priority:
        weightage == null
          ? ""
          : weightage >= 8
            ? "HIGH"
            : weightage >= 4
              ? "MEDIUM"
              : "LOW",
      response: "",
    },
    notes: [
      sampleNote,
      "Review status, management decisions and objective links are not copied from the workbook.",
    ],
  });
}

for (let row = 135; row <= 144; row++) {
  const sheet = "SWOT Register";
  const get = (column) => value(sheet, row, column);
  const code = text(get("A"));
  if (!/^[A-Z]+-2027-OBJ\d{2}$/.test(code))
    throw new Error(`Missing objective at row ${row}`);
  const title = text(get("D"));
  const unit = text(get("H"));
  const baseline = number(get("F"), unit);
  const target = number(get("G"), unit);
  const area = alignment(get("C"));
  const entry = {
    id: `objective:${code}`,
    kind: "objective",
    title,
    pillar: pillar(get("B")),
    sourceCode: code,
    sourceSheet: sheet,
    sourceRow: row,
    ownerRole: text(get("J")),
    fields: {
      title,
      result: title,
      pillar: pillar(get("B")),
      alignments: [area],
      alignment: area,
      measure: text(get("E")),
      definition: text(get("E")),
      baseline,
      target,
      unit,
      direction: direction(title, baseline, target),
      selectionReason: text(get("L")),
      sourceRationale: text(get("L")),
    },
    notes: [
      sampleNote,
      datesNote,
      "Select a responsible person and reviewed SWOT findings from your current organisation. Priority and objective weightage are not supplied in this workbook.",
      ...(area === "OTHER"
        ? ["Describe the business focus for this objective."]
        : []),
    ],
  };
  entries.push(entry);
  objectives.set(code, entry);
}

for (let row = 9; row <= 40; row++) {
  const sheet = "Department Goals";
  const get = (column) => value(sheet, row, column);
  const code = text(get("D"));
  const objectiveCode = text(get("A"));
  const objective = objectives.get(objectiveCode);
  if (!objective || !code)
    throw new Error(`Missing goal identity at row ${row}`);
  const title = text(get("F"));
  const unit = text(get("J"));
  const baseline = number(get("H"), unit);
  const target = number(get("I"), unit);
  const definition = text(get("G"));
  const sourceNote = text(get("M"));
  const [context, achievable = ""] = sourceNote.split(
    /\s*Achievable check\s*[—–-]\s*department head to confirm:\s*/i,
  );
  const notes = [
    sampleNote,
    datesNote,
    "Choose a department, owner and approved company objective from your current organisation. Example codes are reference labels only.",
  ];
  if (baseline === null)
    notes.push(
      "No numerical baseline is supplied. Measure and confirm it before approval; a missing value is not zero.",
    );
  entries.push({
    id: `department-goal:${code}`,
    kind: "department-goal",
    title,
    pillar: objective.pillar,
    department: text(get("B")),
    sourceCode: code,
    sourceSheet: sheet,
    sourceRow: row,
    ownerRole: text(get("L")),
    parentObjectiveCode: objectiveCode,
    parentObjectiveTitle: objective.title,
    fields: {
      title,
      measure: definition.split(/\r?\n/)[0],
      definition,
      baseline,
      target,
      unit,
      direction: direction(title, baseline, target),
      approach: achievable.trim(),
      relevance: context.trim(),
      source: sourceNote,
    },
    notes,
  });
}

if (
  entries.length !== 162 ||
  new Set(entries.map((entry) => entry.id)).size !== 162
) {
  throw new Error("Expected 162 unique workbook examples.");
}
const output = path.join(
  __dirname,
  "../prisma/seeds/planning-library.data.json",
);
fs.writeFileSync(
  output,
  `${JSON.stringify({ version: 1, sourceWorkbook: source, templates: entries }, null, 2)}\n`,
);
console.log(
  `Imported 120 findings, 10 objectives and 32 department goals into ${path.relative(process.cwd(), output)}.`,
);
