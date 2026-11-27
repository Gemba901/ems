import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import type { ActionFacts, ReviewablePlan } from '../common/contracts';
import type {
  DevelopmentActor,
  DevelopmentPerson,
  People,
} from './development-scope';

// Shared test data for the Area 06 specs (not a spec itself).

export const ORG = 'org-1';

export const user = (role: Role = Role.EMPLOYEE): AccessTokenPayload =>
  ({
    tokenType: 'ACCESS',
    userId: 'user-1',
    organizationId: ORG,
    roleId: 1,
    roleLevel: role,
    email: '',
    isAdminOrg: false,
  }) as AccessTokenPayload;

export const actor = (
  employeeId: string | null,
  over: Partial<DevelopmentActor> = {},
): DevelopmentActor => ({
  organizationId: ORG,
  role: Role.EMPLOYEE,
  employeeId,
  departmentId: 'dept-1',
  active: true,
  reportIds: new Set(),
  ...over,
});

export const people = (...rows: Partial<DevelopmentPerson>[]): People =>
  new Map(
    rows.map((r) => [
      r.id!,
      {
        id: r.id!,
        name: r.name ?? r.id!,
        departmentId: r.departmentId ?? 'dept-1',
        managerId: r.managerId ?? null,
        active: r.active ?? true,
      },
    ]),
  );

/** emp-1 reports to mgr-1, who reports to hod-1. */
export const PEOPLE = people(
  { id: 'emp-1', managerId: 'mgr-1' },
  { id: 'mgr-1', managerId: 'hod-1' },
  { id: 'hod-1' },
  { id: 'other' },
);

export const plan = (over: Partial<ReviewablePlan> = {}): ReviewablePlan => ({
  documentId: 'doc-ind',
  version: 2,
  kind: 'INDIVIDUAL',
  cycle: '2026',
  title: 'Emp 1 plan',
  departmentId: 'dept-1',
  scopeId: 'emp-1',
  goals: [
    { id: 'g1', code: 'G1', title: 'Output', ownerId: 'emp-1', kind: 'GOAL' },
  ],
  assignments: [
    {
      id: 'kpi-1',
      code: 'K1',
      name: 'Units',
      unit: 'u',
      ownerId: 'emp-1',
      reviewFrequency: 'MONTHLY',
    },
  ],
  ...over,
});

export const action = (over: Partial<ActionFacts> = {}): ActionFacts => ({
  id: 'act-1',
  title: 'Fix line 2',
  ownerId: 'emp-1',
  departmentId: 'dept-1',
  assignmentId: null,
  dueAt: '2026-09-30T23:59:59.999Z',
  status: 'VERIFIED',
  documentId: 'doc-ind',
  goalId: 'g1',
  goalTitle: 'Output',
  goalOwnerId: 'emp-1',
  expectedResult: 'Less scrap',
  evidence: 'photo',
  checkedById: 'mgr-1',
  checkedAt: '2026-10-01T10:00:00.000Z',
  ...over,
});
