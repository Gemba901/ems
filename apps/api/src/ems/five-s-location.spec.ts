import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { normaliseFiveSLocation, FIVE_S_LOCATION_ERROR } from './five-s-location';
import { UpdateEmployeeEmsDto } from './dto/ems.dto';
import { AddOnboardingRecordsDto, UpdateOnboardingRecordDto } from './dto/onboarding.dto';
import { EmsService, calcEmployeeCompletion } from './ems.service';

test.each([['Store', 'STORE'], [' office ', 'OFFICE'], ['Production shop floor', 'PRODUCTION_SHOP_FLOOR'], ['production_shop_floor', 'PRODUCTION_SHOP_FLOOR'], ['Production Shop-Floor', 'PRODUCTION_SHOP_FLOOR']])('normalises %s to %s', (input, expected) => {
  expect(normaliseFiveSLocation(input)).toBe(expected);
  const dto = plainToInstance(UpdateEmployeeEmsDto, {fiveSLocationCategory: input});
  expect(dto.fiveSLocationCategory).toBe(expected); expect(validateSync(dto)).toEqual([]);
});
test.each([undefined, null, '', ' ', 'N/A', 'none', '--'])('optional %j is not classified or inferred', input => {
  expect(normaliseFiveSLocation(input)).toBeNull();
  expect(validateSync(plainToInstance(UpdateEmployeeEmsDto, {fiveSLocationCategory: input}))).toEqual([]);
});
test.each(['Warehouse', 'Office (Store)', 'STORE OFFICE', 123, {}, ['OFFICE'], 'constructor', '__proto__'])('rejects an unsupported supplied value %j', input => {
  expect(normaliseFiveSLocation(input)).toBeUndefined();
  expect(validateSync(plainToInstance(UpdateEmployeeEmsDto, {fiveSLocationCategory: input})).map(e => e.property)).toContain('fiveSLocationCategory');
});
test('upload/edit DTOs retain invalid text so row validation can explain it; profile DTO rejects it', () => {
  const upload = plainToInstance(AddOnboardingRecordsDto, {records: [{fiveSLocationCategory: 'Warehouse'}]});
  expect(validateSync(upload)).toEqual([]); expect(upload.records[0].fiveSLocationCategory).toBe('Warehouse');
  const edit = plainToInstance(UpdateOnboardingRecordDto, {fiveSLocationCategory: 'Warehouse'});
  expect(validateSync(edit)).toEqual([]);
});
function fixture() {
  const employee: any = {id: 'person', organizationId: 'org', organization: {timeZone: 'Africa/Nairobi'}, departmentId: 'dept', jobTitle: 'Inspector', employmentStatus: 'RETIRED', reportingManagerId: null, fiveSLocationCategory: 'STORE'};
  const update = jest.fn(async ({data}) => Object.assign(employee, data));
  const db: any = {employee: {findFirst: jest.fn(async ({where}) => where.id === employee.id && where.organizationId === employee.organizationId ? {...employee} : null), update}, $transaction: jest.fn(async (fn: any) => fn(db))};
  const service = new EmsService(db); (service as any).lockReporting = jest.fn(); (service as any).resolvePendingAssignments = jest.fn();
  return {employee, service, update};
}
test('profile can change and clear category, preserve status, and ignore omission on unrelated edits', async () => {
  const f = fixture();
  await f.service.updateEmployee('person', 'org', plainToInstance(UpdateEmployeeEmsDto, {fiveSLocationCategory: 'Office', jobTitle: 'Supervisor'}));
  expect(f.employee).toMatchObject({fiveSLocationCategory: 'OFFICE', jobTitle: 'Supervisor', employmentStatus: 'RETIRED'});
  await f.service.updateEmployee('person', 'org', {jobTitle: 'Manager'});
  expect(f.employee.fiveSLocationCategory).toBe('OFFICE');
  await f.service.updateEmployee('person', 'org', {fiveSLocationCategory: null});
  expect(f.employee.fiveSLocationCategory).toBeNull();
});
test('service rejects invalid direct calls before writes and retains organisation scope', async () => {
  const f = fixture();
  await expect(f.service.updateEmployee('person', 'org', {fiveSLocationCategory: 'bad'} as never)).rejects.toThrow(FIVE_S_LOCATION_ERROR);
  await expect(f.service.updateEmployee('person', 'other', {fiveSLocationCategory: 'OFFICE'})).rejects.toThrow('Employee not found');
  expect(f.update).not.toHaveBeenCalled();
});
test('optional category does not change existing completion denominators', () => {
  expect(calcEmployeeCompletion({firstName: 'Jane', fiveSLocationCategory: 'OFFICE'})).toEqual(calcEmployeeCompletion({firstName: 'Jane'}));
});
