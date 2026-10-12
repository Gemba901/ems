import { BadRequestException } from '@nestjs/common';

// Header aliases used to guess columns when the client didn't send an explicit mapping.
// Order matters — the first alias present in the header row wins.
export const IMPORT_FIELD_ALIASES = {
    employeeCode: ['employee code', 'employee numbers'],
    firstName: ['first name'],
    middleName: ['middle name'],
    lastName: ['last name surname', 'last name'],
    fullName: ['employee full name', 'name'],
    email: ['company email', 'email address', 'email', 'email id'],
    personalEmail: ['personal email'],
    phone: ['mobile number', 'phone number', 'phone'],
    department: ['department', 'employees department location', 'employees department', 'employee s current department', 'current department'],
    plantBranch: ['plant branch name or code', 'company plant branch name or code', 'plant branch'],
    section: ['section area', 'sub section line'],
    workStation: ['work location'],
    jobTitle: ['designation', 'role job title', 'employees job designation', 'employee s job designation'],
    role: ['role', 'access level', 'bees access level'],
    gender: ['gender'],
    dateOfBirth: ['date of birth'],
    nationalId: ['national id passport no', 'national id'],
    employmentStatus: ['employment status', 'employee status'],
    employmentType: ['employment type'],
    dateJoined: ['date of joining', 'date joined'],
    skillLevel: ['skill level'],
    trainingNeeded: ['training needed'],
    jobDescription: ['primary work role'],
    homeAddress: ['address'],
} as const;

export type ImportField = keyof typeof IMPORT_FIELD_ALIASES;

// first-rest: "John Kamau Mwangi" → John / Kamau Mwangi
// first-last: "John Kamau Mwangi" → John / Mwangi (Kamau kept as middle name)
// last-first: "Mwangi John Kamau" → John Kamau / Mwangi (surname written first)
export const NAME_SPLIT_MODES = ['first-rest', 'first-last', 'last-first'] as const;
export type NameSplitMode = (typeof NAME_SPLIT_MODES)[number];

export type EmployeeImportMapping = {
    sheetName: string;
    headerRow: number; // 1-based, as shown in Excel
    nameMode: 'separate' | 'full';
    nameSplit: NameSplitMode;
    columns: Partial<Record<ImportField, number>>; // 0-based column index
};

export function splitFullName(fullName: string | undefined, mode: NameSplitMode) {
    const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return { firstName: parts[0] ?? '', lastName: '', middleName: undefined as string | undefined };
    if (mode === 'last-first') {
        return { firstName: parts.slice(1).join(' '), lastName: parts[0], middleName: undefined };
    }
    if (mode === 'first-last') {
        const middle = parts.slice(1, -1).join(' ');
        return { firstName: parts[0], lastName: parts[parts.length - 1], middleName: middle || undefined };
    }
    return { firstName: parts[0], lastName: parts.slice(1).join(' '), middleName: undefined };
}

// Parses and validates the `mapping` multipart field. Returns undefined when none was sent,
// which keeps the legacy auto-detect behaviour.
export function parseImportMapping(raw: unknown): EmployeeImportMapping | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    let value: any;
    try {
        value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        throw new BadRequestException('Column mapping is not valid JSON');
    }
    if (!value || typeof value !== 'object') throw new BadRequestException('Column mapping is invalid');

    const { sheetName, headerRow, nameMode, nameSplit, columns } = value;
    if (typeof sheetName !== 'string' || !sheetName) throw new BadRequestException('Column mapping must name a sheet');
    if (!Number.isInteger(headerRow) || headerRow < 1) throw new BadRequestException('Column mapping header row must be a positive number');
    if (nameMode !== 'separate' && nameMode !== 'full') throw new BadRequestException('Column mapping name mode must be "separate" or "full"');
    const split: NameSplitMode = nameSplit ?? 'first-rest';
    if (!NAME_SPLIT_MODES.includes(split)) throw new BadRequestException('Column mapping name split is not recognised');
    if (!columns || typeof columns !== 'object') throw new BadRequestException('Column mapping must include columns');

    const cleanColumns: Partial<Record<ImportField, number>> = {};
    for (const [field, index] of Object.entries(columns)) {
        if (!(field in IMPORT_FIELD_ALIASES)) throw new BadRequestException(`Unknown import field "${field}"`);
        if (index === null || index === undefined) continue;
        if (!Number.isInteger(index) || (index as number) < 0) throw new BadRequestException(`Column for "${field}" must be a column index`);
        cleanColumns[field as ImportField] = index as number;
    }

    if (cleanColumns.email === undefined && cleanColumns.personalEmail === undefined && cleanColumns.phone === undefined && cleanColumns.employeeCode === undefined) {
        throw new BadRequestException('Map at least one identifier column: email, phone or employee code');
    }

    return { sheetName, headerRow, nameMode, nameSplit: split, columns: cleanColumns };
}
