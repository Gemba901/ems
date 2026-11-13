import { PlanningReferencesService } from './planning-references.service';
import { DEFAULT_SCHEDULE } from 'src/work/work-schedule';

function fixture() {
  const db = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ timeZone: 'Africa/Nairobi' }),
    },
    department: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'dept-1', name: 'Production' }]),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'emp-1',
          firstName: 'Asha',
          lastName: 'Patel',
          jobTitle: 'Manager',
          departmentId: 'dept-1',
          section: 'Packaging',
          userId: 'user-1',
          updatedAt: new Date('2026-11-01T10:00:00Z'),
          user: { organizations: [{ role: { name: 'HOD' } }] },
        },
      ]),
    },
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Asha Account' }) },
    workHoliday: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { date: new Date('2026-01-04T00:00:00Z'), name: 'Company day' },
        ]),
    },
  };
  const direction: Record<string, unknown> = {};
  const framework: Record<string, unknown> = {};
  const library: Record<string, unknown> = {};
  const schedules = {
    getSchedule: jest.fn().mockResolvedValue({ ...DEFAULT_SCHEDULE }),
  };
  const service = new PlanningReferencesService(
    db as never,
    direction as never,
    framework as never,
    library as never,
    schedules as never,
  );
  const user = {
    userId: 'user-1',
    organizationId: 'org-1',
    roleLevel: 'HOD',
    email: null,
  } as never;
  return { db, direction, framework, library, schedules, service, user };
}

describe('planning dependency adapters', () => {
  it('uses existing organisation time zone and shared observed holidays without writing records', async () => {
    const { db, service, user } = fixture();
    const { references, actor } = await service.get(user);
    expect(references.calendar).toMatchObject({
      source: 'WORK_SETTINGS',
      approved: false,
      timeZone: 'Africa/Nairobi',
    });
    expect(references.calendar?.holidays).toEqual(['2026-01-04', '2026-01-05']);
    expect(references.positions).toEqual([]);
    expect(references.dependencyStatus?.positions).toBe('UNAVAILABLE');
    expect(references.dependencyStatus?.library).toBe('LOCAL_CATALOGUE');
    expect(references.direction).toBeNull();
    expect(references.dependencyStatus?.direction).toBe('UNAVAILABLE');
    expect(actor.name).toBe('Asha Account');
    expect(references.sourceUpdatedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(db.employee.findMany.mock.calls[0][0].where.organizationId).toBe(
      'org-1',
    );
    expect(db.workHoliday.findMany.mock.calls[0][0].where.organizationId).toBe(
      'org-1',
    );
  });

  it('passes through approved company direction and original core value identities', async () => {
    const { service, direction, user } = fixture();
    const approved = {
      version: 2,
      company: 'Gemba Plastic',
      purpose: 'Reliable packaging',
      vision: 'Trusted packaging partner',
      mission: 'Deliver consistent product quality',
      values: [
        { id: 'value-quality', name: 'Quality', why: 'Right first time' },
      ],
    };
    direction.getApproved = jest.fn().mockResolvedValue(approved);
    const { references } = await service.get(user);
    expect(direction.getApproved).toHaveBeenCalledWith('org-1');
    expect(references.direction).toEqual(approved);
    expect(references.dependencyStatus?.direction).toBe('AVAILABLE');
    expect(references.direction?.values).not.toBe(approved.values);
  });

  it('does not invent direction or values when the provider has not published them', async () => {
    const { service, direction, user } = fixture();
    direction.getApproved = jest.fn().mockResolvedValue(null);
    expect((await service.get(user)).references.direction).toBeNull();

    direction.getApproved = jest.fn().mockResolvedValue({
      version: 1,
      company: 'Gemba Plastic',
      purpose: '',
      vision: '',
      mission: '',
    });
    expect((await service.get(user)).references.direction?.values).toEqual([]);
  });

  it('uses stable provider positions including vacancies, never job-title based IDs', async () => {
    const { service, framework, user } = fixture();
    framework.getPlanningPositions = jest.fn().mockResolvedValue([
      {
        id: 'position-1',
        name: 'Manager',
        departmentId: 'dept-1',
        holderIds: ['emp-1'],
      },
      {
        id: 'position-2',
        name: 'Technician',
        departmentId: 'dept-1',
        holderIds: [],
      },
    ]);
    const { references, actor } = await service.get(user);
    expect(references.positions?.map((position) => position.id)).toEqual([
      'position-1',
      'position-2',
    ]);
    expect(actor.positionIds).toEqual(['position-1']);
    expect(references.dependencyStatus?.positions).toBe('AVAILABLE');
  });

  it('consumes an approved Area 02 calendar and Area 07 definitions when providers publish them', async () => {
    const { service, framework, library, user, schedules } = fixture();
    framework.getApprovedPlanningCalendar = jest.fn().mockResolvedValue({
      id: 'calendar-1',
      version: 3,
      source: 'AREA_02',
      approved: true,
      timeZone: 'Asia/Kolkata',
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      workingDays: [1, 2, 3, 4, 5, 6],
      holidays: [],
      weekStart: 1,
      fortnightAnchor: '2026-04-01',
      twiceMonthlySplit: 15,
      submissionDueDays: 2,
    });
    library.getApprovedPlanningLibrary = jest
      .fn()
      .mockResolvedValue({ kras: [], definitions: [] });
    const { references } = await service.get(user);
    expect(references.calendar?.version).toBe(3);
    expect(references.timeZone).toBe('Asia/Kolkata');
    expect(references.dependencyStatus?.calendar).toBe('APPROVED');
    expect(references.dependencyStatus?.library).toBe('AVAILABLE');
    expect(references.library).toEqual({ kras: [], definitions: [] });
    expect(schedules.getSchedule).not.toHaveBeenCalled();
  });

  it('changes the work-calendar snapshot version when working days change', async () => {
    const { service, schedules } = fixture();
    const old = await service.getCalendar('org-1');
    schedules.getSchedule.mockResolvedValue({
      ...DEFAULT_SCHEDULE,
      workingDays: [1, 2, 3, 4, 5, 6],
    });
    const current = await service.getCalendar('org-1');
    expect(old.version).not.toBe(current.version);
  });
});
