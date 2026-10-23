import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmsService } from './ems.service';
import { SetOnboardingColumnDestinationDto } from './dto/onboarding.dto';
import { columnHeadingKey, isColumnDestination, normaliseColumnChoices } from './onboarding-column-choices';

const extra = (column: number, heading: string, value: string, target: string | null = null) =>
  ({ column, heading, originalValue: value, value, target });

function setup() {
  const state: any = {
    batch: { id: 'batch', organizationId: 'org', status: 'PARTIALLY_REGISTERED' },
    records: [
      { id: 'a', status: 'READY', extraFields: [extra(6, 'DOB', '1990-01-02'), extra(7, 'Notes', 'x')] },
      { id: 'b', status: 'NEEDS_FIXING', extraFields: [extra(6, 'DOB', '1991-03-04')] },
      { id: 'reg', status: 'REGISTERED', extraFields: [extra(6, 'DOB', '1980-01-01')] },
      { id: 'out', status: 'EXCLUDED', extraFields: [extra(6, 'DOB', '1985-01-01')] },
      { id: 'other-col', status: 'READY', extraFields: [extra(9, 'DOB', '1970-01-01')] },
    ],
    choices: [] as any[],
  };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
    emsOnboardingBatch: {
      findFirst: jest.fn(async ({ where }: any) => where.id === state.batch.id && where.organizationId === state.batch.organizationId
        ? { status: state.batch.status, records: state.records.map((r: any) => ({ ...r, extraFields: JSON.parse(JSON.stringify(r.extraFields)) })) } : null),
    },
    emsOnboardingRecord: {
      update: jest.fn(async ({ where, data }: any) => Object.assign(state.records.find((r: any) => r.id === where.id), data)),
    },
    emsImportColumnChoice: {
      findMany: jest.fn(async ({ where }: any) => state.choices.filter((c: any) => c.organizationId === where.organizationId && where.headingKey.in.includes(c.headingKey))),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const { organizationId, headingKey } = where.organizationId_headingKey;
        const found = state.choices.find((c: any) => c.organizationId === organizationId && c.headingKey === headingKey);
        if (found) return Object.assign(found, update);
        state.choices.push({ ...create }); return create;
      }),
    },
  };
  const service = new EmsService(prisma as unknown as PrismaService);
  jest.spyOn(service as any, 'lockReporting').mockResolvedValue(undefined);
  const revalidate = jest.spyOn(service as any, 'validateOnboardingBatchLocked').mockResolvedValue(undefined);
  jest.spyOn(service, 'getOnboardingBatch').mockImplementation(async () => ({ id: 'batch' }) as never);
  return { service, prisma, state, revalidate };
}
const targetOf = (state: any, id: string, column = 6) => state.records.find((r: any) => r.id === id).extraFields.find((f: any) => f.column === column)?.target;

describe('column heading keys and destinations', () => {
  it('ignores case, spacing and punctuation in headings', () => {
    expect(columnHeadingKey('  Staff No. ')).toBe('staff no');
    expect(columnHeadingKey('STAFF_NO')).toBe(columnHeadingKey('staff-no'));
    expect(columnHeadingKey('')).toBe('');
  });
  it.each(['extra', 'ignore', 'fullName', 'employeeCode', 'profile:dateOfBirth', 'profile:dateOfBirth@DMY', 'profile:dateJoined@MDY'])('accepts %s', value => expect(isColumnDestination(value)).toBe(true));
  it.each(['', 'profile:notAField', 'Drop table', 'x', 'a'.repeat(81), 42, 'profile:level@DMY', 'profile:dateOfBirth@YMD', 'employeeCode@DMY'])('rejects %s', value => expect(isColumnDestination(value)).toBe(false));
  it('keeps the last valid choice per heading and skips blanks', () => {
    expect(normaliseColumnChoices([
      { heading: 'DOB', destination: 'extra' }, { heading: 'dob ', destination: 'profile:dateOfBirth' },
      { heading: '   ', destination: 'extra' }, { heading: 'Notes', destination: 'profile:bogus' },
    ])).toEqual([{ headingKey: 'dob', heading: 'dob', destination: 'profile:dateOfBirth' }]);
  });
});

describe('remembered column choices', () => {
  it('returns remembered destinations aligned with the headings, scoped to the organization', async () => {
    const { service, state, prisma } = setup();
    state.choices.push({ organizationId: 'org', headingKey: 'staff no', destination: 'employeeCode' },
      { organizationId: 'other-org', headingKey: 'dob', destination: 'profile:dateOfBirth' });
    await expect(service.lookupImportColumnChoices('org', { headings: ['Staff No.', 'DOB', ''] }))
      .resolves.toEqual({ choices: ['employeeCode', null, null] });
    expect(prisma.emsImportColumnChoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org' }) }));
  });

  it('saves confirmed choices per organization and overwrites an earlier choice', async () => {
    const { service, state } = setup();
    await service.saveImportColumnChoices('org', 'hr', { choices: [{ heading: 'Plant & Department', destination: 'extra' }] });
    await service.saveImportColumnChoices('org', 'hr', { choices: [{ heading: 'plant  & department', destination: 'ignore' }, { heading: 'Bad', destination: 'profile:nope' }] });
    expect(state.choices).toEqual([expect.objectContaining({ organizationId: 'org', headingKey: 'plant department', destination: 'ignore', updatedById: 'hr' })]);
  });
});

describe('column destination for an import', () => {
  it('changes only unregistered, non-excluded records with that column, re-validates and remembers', async () => {
    const { service, state, revalidate } = setup();
    await service.setOnboardingColumnDestination('org', 'batch', 'hr', { column: 6, heading: 'DOB', target: 'dateOfBirth' });
    expect(targetOf(state, 'a')).toBe('dateOfBirth');
    expect(targetOf(state, 'b')).toBe('dateOfBirth');
    expect(targetOf(state, 'reg')).toBeNull();
    expect(targetOf(state, 'out')).toBeNull();
    expect(targetOf(state, 'other-col', 9)).toBeNull();
    expect(targetOf(state, 'a', 7)).toBeNull();
    expect(revalidate).toHaveBeenCalledWith(expect.anything(), 'org', 'batch');
    expect(state.choices).toEqual([expect.objectContaining({ headingKey: 'dob', destination: 'profile:dateOfBirth' })]);
  });

  it('can send a column back to reference only', async () => {
    const { service, state } = setup();
    state.records[0].extraFields[0].target = 'dateOfBirth';
    await service.setOnboardingColumnDestination('org', 'batch', 'hr', { column: 6, heading: 'DOB', target: null });
    expect(targetOf(state, 'a')).toBeNull();
    expect(state.choices[0].destination).toBe('extra');
  });

  it('refuses another organization, a cancelled import, an unknown column and an unsupported field', async () => {
    const one = setup();
    await expect(one.service.setOnboardingColumnDestination('other-org', 'batch', 'hr', { column: 6, heading: 'DOB', target: null })).rejects.toBeInstanceOf(NotFoundException);
    const two = setup(); two.state.batch.status = 'CANCELLED';
    await expect(two.service.setOnboardingColumnDestination('org', 'batch', 'hr', { column: 6, heading: 'DOB', target: null })).rejects.toThrow('cancelled');
    const three = setup();
    await expect(three.service.setOnboardingColumnDestination('org', 'batch', 'hr', { column: 30, heading: 'Missing', target: null })).rejects.toThrow('No unregistered records');
    expect(three.prisma.emsOnboardingRecord.update).not.toHaveBeenCalled();
    const four = setup();
    await expect(four.service.setOnboardingColumnDestination('org', 'batch', 'hr', { column: 6, heading: 'DOB', target: 'salary' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the request shape', () => {
    const errors = (body: object) => validateSync(plainToInstance(SetOnboardingColumnDestinationDto, body)).length;
    expect(errors({ column: 6, heading: 'DOB', target: 'dateOfBirth' })).toBe(0);
    expect(errors({ column: 6, heading: 'DOB', target: null })).toBe(0);
    expect(errors({ column: 0, heading: 'DOB', target: null })).toBeGreaterThan(0);
    expect(errors({ column: 6, heading: 'DOB', target: 'salary' })).toBeGreaterThan(0);
  });
});

describe('profile field list', () => {
  it('keeps the API and web copies identical', () => {
    const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8').replace(/\r\n/g, '\n');
    expect(read('../../../web/components/ems/onboarding-extra-fields.ts')).toBe(read('./onboarding-extra-fields.ts'));
  });
});
