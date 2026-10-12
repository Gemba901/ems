import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { EmployeeService } from './employee.service';
import { parseImportMapping, splitFullName } from './employee-import-mapping';

function workbook(rows: any[][], sheetName = 'Staff') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('employee import column mapping', () => {
    const service = new EmployeeService({} as any, {} as any);
    const parse = (buffer: Buffer, mapping?: any) => (service as any).parseEmployeeWorkbook(buffer, mapping);

    describe('splitFullName', () => {
        it('splits first word / rest by default', () => {
            expect(splitFullName('John Kamau Mwangi', 'first-rest')).toMatchObject({ firstName: 'John', lastName: 'Kamau Mwangi' });
        });
        it('keeps middle names aside when splitting first / last word', () => {
            expect(splitFullName('John Kamau Mwangi', 'first-last')).toEqual({ firstName: 'John', lastName: 'Mwangi', middleName: 'Kamau' });
        });
        it('handles surname-first names', () => {
            expect(splitFullName('Mwangi John Kamau', 'last-first')).toMatchObject({ firstName: 'John Kamau', lastName: 'Mwangi' });
        });
        it('cannot split a single word', () => {
            expect(splitFullName('Cher', 'first-rest')).toMatchObject({ firstName: 'Cher', lastName: '' });
        });
    });

    describe('parseImportMapping', () => {
        const valid = { sheetName: 'Staff', headerRow: 1, nameMode: 'full', nameSplit: 'first-last', columns: { fullName: 0, phone: 1 } };

        it('returns undefined when no mapping is sent', () => {
            expect(parseImportMapping(undefined)).toBeUndefined();
            expect(parseImportMapping('')).toBeUndefined();
        });
        it('parses a JSON mapping', () => {
            expect(parseImportMapping(JSON.stringify(valid))).toEqual(valid);
        });
        it('rejects unknown fields and missing identifiers', () => {
            expect(() => parseImportMapping({ ...valid, columns: { fullName: 0, salary: 2 } })).toThrow(BadRequestException);
            expect(() => parseImportMapping({ ...valid, columns: { fullName: 0 } })).toThrow(/identifier/);
        });
    });

    it('reads mapped columns from a custom header row and splits full names', () => {
        const buffer = workbook([
            ['Acme staff list'],
            [],
            ['Staff Name', 'Cell', 'Dept', 'Ignored'],
            ['Evans Ouma Ondiek', '+254 720 054476', 'Operations', 'x'],
            ['Brian', '254716004156', 'Finance', 'y'],
        ]);
        const result = parse(buffer, {
            sheetName: 'Staff',
            headerRow: 3,
            nameMode: 'full',
            nameSplit: 'first-last',
            columns: { fullName: 0, phone: 1, department: 2 },
        });

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({
            rowNumber: 4,
            firstName: 'Evans',
            middleName: 'Ouma',
            lastName: 'Ondiek',
            phone: '254720054476',
            department: 'Operations',
        });
        expect(result.issues).toEqual([{ row: 5, message: expect.stringContaining('only one word') }]);
    });

    it('reads separate first and last name columns', () => {
        const buffer = workbook([
            ['Given', 'Surname', 'Mail'],
            ['Jane', 'Doe', 'JANE@ACME.COM'],
        ]);
        const result = parse(buffer, {
            sheetName: 'Staff',
            headerRow: 1,
            nameMode: 'separate',
            nameSplit: 'first-rest',
            columns: { firstName: 0, lastName: 1, email: 2 },
        });
        expect(result.rows[0]).toMatchObject({ firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.com' });
    });

    it('still auto-detects columns when no mapping is given', () => {
        const buffer = workbook([
            ['Employee Code', 'Employee Full Name', 'Email ID', 'Department'],
            ['E1', 'Jane Wanjiru Doe', 'jane@acme.com', 'HR'],
        ]);
        const result = parse(buffer);
        expect(result.rows[0]).toMatchObject({ employeeCode: 'E1', firstName: 'Jane', lastName: 'Wanjiru Doe', department: 'HR' });
    });
});
