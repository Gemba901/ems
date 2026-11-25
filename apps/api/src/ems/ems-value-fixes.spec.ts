import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { ReplaceOnboardingValuesDto } from './dto/onboarding.dto';
import { importedAccountRole } from './onboarding-access';
import { matchEnumValue, normaliseKey } from './onboarding-text';
import { VALUE_FIX_CHOICES, matchesValueFix, valueFixText } from './onboarding-value-fixes';

function setup() {
  const state: any = {
    batch: { id: 'batch', organizationId: 'org', status: 'DRAFT' },
    records: [
      { id: 'a', status: 'NEEDS_FIXING', beesAccessLevel: 'Exec.', employmentStatus: null, employmentType: 'Perm', gender: 'M' },
      { id: 'b', status: 'READY', beesAccessLevel: 'exec', employmentStatus: 'N/A', employmentType: 'perm.', gender: 'Female' },
      { id: 'c', status: 'NEEDS_FIXING', beesAccessLevel: 'Employee', employmentStatus: 'Active', employmentType: 'Permanent', gender: 'nil' },
      { id: 'reg', status: 'REGISTERED', beesAccessLevel: 'Exec', employmentStatus: null, employmentType: 'Perm', gender: null },
      { id: 'out', status: 'EXCLUDED', beesAccessLevel: 'Exec', employmentStatus: null, employmentType: 'Perm', gender: null },
    ],
  };
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (arg: any) => arg(prisma)),
    emsOnboardingBatch: {
      findFirst: jest.fn(async ({ where }: any) => where.id === state.batch.id && where.organizationId === state.batch.organizationId
        ? { status: state.batch.status, records: state.records.map((r: any) => ({ ...r })) } : null),
    },
    emsOnboardingRecord: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = state.records.filter((r: any) => where.id.in.includes(r.id) && !where.status.notIn.includes(r.status));
        hit.forEach((r: any) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
  };
  const service = new EmsService(prisma as unknown as PrismaService);
  jest.spyOn(service as any, 'lockReporting').mockResolvedValue(undefined);
  const revalidate = jest.spyOn(service as any, 'validateOnboardingBatchLocked').mockResolvedValue(undefined);
  jest.spyOn(service, 'getOnboardingBatch').mockImplementation(async () => ({ id: 'batch' }) as never);
  return { service, prisma, state, revalidate };
}
const value = (state: any, id: string, field: string) => state.records.find((r: any) => r.id === id)[field];

describe('Treat as: one value for every matching unregistered record', () => {
  it('rewrites every spelling of the value in waiting records only, then validates again', async () => {
    const { service, state, revalidate } = setup();
    await service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'employmentType', from: 'Perm', to: 'FULL_TIME' });
    expect(['a', 'b', 'c', 'reg', 'out'].map(id => value(state, id, 'employmentType'))).toEqual(['Full time', 'Full time', 'Permanent', 'Perm', 'Perm']);
    expect(revalidate).toHaveBeenCalledWith(expect.anything(), 'org', 'batch');
  });

  it('sets blank and N/A employment statuses to Active, and nothing else', async () => {
    const { service, state } = setup();
    await service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'employmentStatus', blanks: true, to: 'ACTIVE' });
    expect(['a', 'b', 'c', 'reg'].map(id => value(state, id, 'employmentStatus'))).toEqual(['Active', 'Active', 'Active', null]);
  });

  it('lets HR map access to Employee, but only an Admin above it', async () => {
    const hr = setup();
    await hr.service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'beesAccessLevel', from: 'exec', to: 'EMPLOYEE' });
    expect(value(hr.state, 'a', 'beesAccessLevel')).toBe('Employee');
    const blocked = setup();
    await expect(blocked.service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'beesAccessLevel', from: 'exec', to: 'MANAGEMENT' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(blocked.prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    const admin = setup();
    await admin.service.replaceOnboardingValues('org', 'batch', Role.ADMIN, { field: 'beesAccessLevel', from: 'exec', to: 'MANAGEMENT' });
    expect(value(admin.state, 'b', 'beesAccessLevel')).toBe('Executive');
  });

  it('refuses another organisation, a cancelled import, an unknown choice, blanks outside status and a value no longer present', async () => {
    await expect(setup().service.replaceOnboardingValues('other', 'batch', Role.HR, { field: 'gender', from: 'M', to: 'MALE' })).rejects.toBeInstanceOf(NotFoundException);
    const cancelled = setup(); cancelled.state.batch.status = 'CANCELLED';
    await expect(cancelled.service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'gender', from: 'M', to: 'MALE' })).rejects.toThrow('cancelled');
    await expect(setup().service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'gender', from: 'M', to: 'MAN' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'gender', blanks: true, to: 'MALE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'gender', from: '--', to: 'MALE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.replaceOnboardingValues('org', 'batch', Role.HR, { field: 'gender', from: 'Unknown', to: 'MALE' })).rejects.toThrow('No unregistered records');
  });

  it('writes text that validation recognises as the chosen value', () => {
    const statuses = new Set(Object.keys(VALUE_FIX_CHOICES.employmentStatus)), types = new Set(Object.keys(VALUE_FIX_CHOICES.employmentType));
    for (const [key, text] of Object.entries(VALUE_FIX_CHOICES.employmentStatus)) expect(matchEnumValue(text, statuses)).toBe(key);
    for (const [key, text] of Object.entries(VALUE_FIX_CHOICES.employmentType)) expect(matchEnumValue(text, types)).toBe(key);
    for (const [key, text] of Object.entries(VALUE_FIX_CHOICES.beesAccessLevel)) expect(importedAccountRole(text)).toBe(key);
    for (const [key, text] of Object.entries(VALUE_FIX_CHOICES.gender)) expect(normaliseKey(text).toUpperCase()).toBe(key);
    expect(valueFixText('beesAccessLevel', 'SUPER_ADMIN')).toBeUndefined();
  });

  it('groups values ignoring case and punctuation, and blanks with placeholders and N/A', () => {
    expect(matchesValueFix('Exec.', { from: 'exec' })).toBe(true);
    expect(matchesValueFix('Executive', { from: 'exec' })).toBe(false);
    expect(['', null, 'nil', 'N/A', '-'].every(v => matchesValueFix(v, { blanks: true }))).toBe(true);
    expect(matchesValueFix('Active', { blanks: true })).toBe(false);
  });

  it('validates the request shape and limits the route to HR and Admins', () => {
    const errors = (body: object) => validateSync(plainToInstance(ReplaceOnboardingValuesDto, body)).length;
    expect(errors({ field: 'employmentType', from: 'Perm', to: 'FULL_TIME' })).toBe(0);
    expect(errors({ field: 'employmentStatus', blanks: true, to: 'ACTIVE' })).toBe(0);
    expect(errors({ field: 'jobDesignation', from: 'x', to: 'y' })).toBeGreaterThan(0);
    expect(errors({ field: 'gender', from: 'M' })).toBeGreaterThan(0);
    expect(Reflect.getMetadata(ROLES_KEY, EmsController.prototype.replaceOnboardingValues)).toEqual([Role.SUPER_ADMIN, Role.ADMIN, Role.HR]);
  });

  it('keeps the API and web copies of the access rules and value choices identical', () => {
    const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf8').replace(/\r\n/g, '\n');
    expect(read('../../../web/components/ems/onboarding-access.ts')).toBe(read('./onboarding-access.ts'));
    const choices = (text: string) => text.slice(text.indexOf('export const VALUE_FIX_CHOICES'), text.indexOf('};', text.indexOf('export const VALUE_FIX_CHOICES')));
    expect(choices(read('../../../web/components/ems/onboarding-value-fixes.ts'))).toBe(choices(read('./onboarding-value-fixes.ts')));
  });
});
