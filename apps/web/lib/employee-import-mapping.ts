// Column mapping for the employee Excel import. Field keys must match
// apps/api/src/employee/employee-import-mapping.ts.

export type ImportField =
    | "employeeCode" | "firstName" | "middleName" | "lastName" | "fullName"
    | "email" | "personalEmail" | "phone"
    | "department" | "plantBranch" | "section" | "workStation" | "jobTitle" | "role"
    | "gender" | "dateOfBirth" | "nationalId" | "employmentStatus" | "employmentType"
    | "dateJoined" | "skillLevel" | "trainingNeeded" | "jobDescription" | "homeAddress";

export type NameSplitMode = "first-rest" | "first-last" | "last-first";

export type EmployeeImportMapping = {
    sheetName: string;
    headerRow: number; // 1-based, as shown in Excel
    nameMode: "separate" | "full";
    nameSplit: NameSplitMode;
    columns: Partial<Record<ImportField, number>>;
};

export type FieldDef = { key: ImportField; label: string; aliases: string[] };

export const NAME_FIELDS: FieldDef[] = [
    { key: "fullName", label: "Full name", aliases: ["employee full name", "full name", "employee name", "staff name", "name"] },
    { key: "firstName", label: "First name", aliases: ["first name", "given name", "forename"] },
    { key: "middleName", label: "Middle name", aliases: ["middle name", "other names"] },
    { key: "lastName", label: "Last name", aliases: ["last name surname", "last name", "surname", "family name"] },
];

export const IDENTIFIER_FIELDS: FieldDef[] = [
    { key: "employeeCode", label: "Employee code", aliases: ["employee code", "employee numbers", "employee number", "staff no", "staff number", "payroll number", "emp no"] },
    { key: "email", label: "Company email", aliases: ["company email", "email address", "email", "email id", "work email"] },
    { key: "personalEmail", label: "Personal email", aliases: ["personal email"] },
    { key: "phone", label: "Phone", aliases: ["mobile number", "phone number", "phone", "mobile", "telephone", "cell"] },
];

export const DETAIL_FIELDS: FieldDef[] = [
    { key: "department", label: "Department", aliases: ["department", "employees department location", "employees department", "employee s current department", "current department", "dept"] },
    { key: "jobTitle", label: "Job title", aliases: ["designation", "role job title", "employees job designation", "employee s job designation", "job title", "position"] },
    { key: "role", label: "System role / access level", aliases: ["role", "access level", "bees access level", "system role"] },
    { key: "plantBranch", label: "Plant / branch", aliases: ["plant branch name or code", "company plant branch name or code", "plant branch", "branch", "site"] },
    { key: "section", label: "Section / area", aliases: ["section area", "work area", "sub section line", "section"] },
    { key: "workStation", label: "Work location", aliases: ["work location", "work station", "workstation"] },
    { key: "gender", label: "Gender", aliases: ["gender", "sex"] },
    { key: "dateOfBirth", label: "Date of birth", aliases: ["date of birth", "dob", "birth date"] },
    { key: "nationalId", label: "National ID / passport", aliases: ["national id passport no", "national id", "id number", "passport"] },
    { key: "employmentStatus", label: "Employment status", aliases: ["employment status", "employee status"] },
    { key: "employmentType", label: "Employment type", aliases: ["employment type", "contract type"] },
    { key: "dateJoined", label: "Date joined", aliases: ["date of joining", "date joined", "start date", "hire date"] },
    { key: "skillLevel", label: "Skill level", aliases: ["skill level"] },
    { key: "trainingNeeded", label: "Training needed", aliases: ["training needed"] },
    { key: "jobDescription", label: "Primary work role", aliases: ["primary work role", "job description"] },
    { key: "homeAddress", label: "Home address", aliases: ["address", "home address"] },
];

const ALL_FIELDS = [...NAME_FIELDS, ...IDENTIFIER_FIELDS, ...DETAIL_FIELDS];

export const NAME_SPLIT_OPTIONS: { value: NameSplitMode; label: string; hint: string }[] = [
    { value: "first-rest", label: "First word is the first name", hint: "Everything after it becomes the last name" },
    { value: "first-last", label: "First word + last word", hint: "Words in between are kept as middle names" },
    { value: "last-first", label: "Surname is written first", hint: "First word is the last name, the rest is the first name" },
];

export type SheetData = { name: string; rows: unknown[][] };

export async function readWorkbook(file: File): Promise<SheetData[]> {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    return workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: null, raw: true }),
    }));
}

// Same normalisation as the API, so suggestions line up with what the server auto-detects.
export function normalizeKey(value: unknown) {
    return String(value ?? "")
        .replace(/★/g, "")
        .replace(/\s*\/\s*/g, " ")
        .replace(/[\n\r]+/g, " ")
        .replace(/\([^)]*\)/g, "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
}

export function columnLetter(index: number) {
    let n = index + 1;
    let out = "";
    while (n > 0) {
        const r = (n - 1) % 26;
        out = String.fromCharCode(65 + r) + out;
        n = Math.floor((n - 1) / 26);
    }
    return out;
}

export function cellText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toLocaleDateString();
    return String(value).replace(/\s+/g, " ").trim();
}

const ALL_ALIASES = new Set(ALL_FIELDS.flatMap((f) => f.aliases));

// Template headers often carry a hint on a second line ("First Name\n★ Required"),
// so a header is matched on both its full text and its first line.
function headerKeys(cell: unknown) {
    const full = normalizeKey(cell);
    const firstLine = normalizeKey(String(cell ?? "").split(/[\n\r]/)[0]);
    return full === firstLine ? [full] : [full, firstLine];
}

function headerScore(row: unknown[] | undefined) {
    if (!row) return 0;
    return row.filter((cell) => headerKeys(cell).some((k) => ALL_ALIASES.has(k))).length;
}

// Picks the row (0-based) within the first 30 that looks most like a header row.
export function detectHeaderRow(rows: unknown[][]): number {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const score = headerScore(rows[i]);
        if (score > bestScore) { best = i; bestScore = score; }
    }
    if (best >= 0) return best;
    const firstFilled = rows.findIndex((r) => (r ?? []).filter((c) => cellText(c)).length >= 2);
    return Math.max(0, firstFilled);
}

export function pickDefaultSheet(sheets: SheetData[]): string {
    const named = sheets.find((s) => ["employee master", "employee data"].includes(normalizeKey(s.name)));
    if (named) return named.name;
    const scored = [...sheets].sort((a, b) => headerScore(b.rows[detectHeaderRow(b.rows)]) - headerScore(a.rows[detectHeaderRow(a.rows)]));
    return scored[0]?.name ?? "";
}

// Suggests a column for every field: exact header matches first, then multi-word aliases
// contained in a longer header. A column is never suggested for two fields.
export function suggestColumns(headers: unknown[]): Partial<Record<ImportField, number>> {
    const keys = headers.map(headerKeys);
    const used = new Set<number>();
    const result: Partial<Record<ImportField, number>> = {};
    const skip = (k: string[]) => !k[0] || k[0].startsWith("do not write");

    for (const field of ALL_FIELDS) {
        for (const alias of field.aliases) {
            const index = keys.findIndex((k, i) => !used.has(i) && !skip(k) && k.includes(alias));
            if (index >= 0) { result[field.key] = index; used.add(index); break; }
        }
    }
    for (const field of ALL_FIELDS) {
        if (result[field.key] !== undefined) continue;
        for (const alias of field.aliases.filter((a) => a.includes(" "))) {
            const index = keys.findIndex((k, i) => !used.has(i) && !skip(k) && ` ${k[0]} `.includes(` ${alias} `));
            if (index >= 0) { result[field.key] = index; used.add(index); break; }
        }
    }
    return result;
}

export function splitFullName(fullName: string, mode: NameSplitMode) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return { firstName: parts[0] ?? "", middleName: "", lastName: "" };
    if (mode === "last-first") return { firstName: parts.slice(1).join(" "), middleName: "", lastName: parts[0] };
    if (mode === "first-last") return { firstName: parts[0], middleName: parts.slice(1, -1).join(" "), lastName: parts[parts.length - 1] };
    return { firstName: parts[0], middleName: "", lastName: parts.slice(1).join(" ") };
}

// What's still missing before the mapping can be submitted; empty when ready.
export function mappingProblems(mapping: EmployeeImportMapping): string[] {
    const c = mapping.columns;
    const problems: string[] = [];
    if (mapping.nameMode === "full" && c.fullName === undefined) problems.push("Choose the full name column");
    if (mapping.nameMode === "separate") {
        if (c.firstName === undefined) problems.push("Choose the first name column");
        if (c.lastName === undefined) problems.push("Choose the last name column");
    }
    if (c.employeeCode === undefined && c.email === undefined && c.personalEmail === undefined && c.phone === undefined) {
        problems.push("Choose at least one identifier: employee code, email or phone");
    }
    return problems;
}

// Drops the name columns that don't apply to the chosen name mode before sending.
export function toRequestMapping(mapping: EmployeeImportMapping): EmployeeImportMapping {
    const columns = { ...mapping.columns };
    if (mapping.nameMode === "full") { delete columns.firstName; delete columns.middleName; delete columns.lastName; }
    else delete columns.fullName;
    return { ...mapping, columns };
}
