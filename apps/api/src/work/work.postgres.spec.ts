import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { ModuleType, PrismaClient, RoleName } from 'db';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { ProxySecretGuard } from '../common/guards/proxy-secret.guard';
import { SafeExceptionFilter } from '../operations/safe-exception.filter';
import { PrismaService } from '../prisma/prisma.service';
import { WorkModule } from './work.module';

// Explicit opt-in: never fall back to the application DATABASE_URL.
// The schema must come from `prisma migrate deploy`, not `db push`: the partial
// unique indexes and CHECK constraints these tests rely on live in the migration SQL.
const url = process.env.WORK_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

// Each test makes many real HTTP + database round trips; 5 s flakes on a busy machine.
jest.setTimeout(30_000);

const JWT_SECRET = randomBytes(32).toString('hex');
const PROXY_SECRET = randomBytes(32).toString('hex');
const BASE_DOMAIN = 'work-test.local';

suite('Team Workspace API on PostgreSQL', () => {
  let db: PrismaClient;
  let app: INestApplication;
  const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '10m' } });
  const run = randomUUID().slice(0, 8);
  const orgId = `work-${run}`;
  const otherOrgId = `work-other-${run}`;
  const slug = `work-${run}`;
  const id = (name: string) => `${name}-${run}`;

  // admin: ADMIN with a profile; member: project member; outsider: same company, no projects;
  // hr: attendance manager; noProfile: no employee record; foreign: another company;
  // remote / onsite: plain employees for the location checks.
  const people = {
    admin: { role: RoleName.ADMIN, org: orgId, first: 'Ada', last: 'Admin' },
    member: { role: RoleName.EMPLOYEE, org: orgId, first: 'Mary', last: 'Member' },
    outsider: { role: RoleName.EMPLOYEE, org: orgId, first: 'Otto', last: 'Side' },
    hr: { role: RoleName.HR, org: orgId, first: 'Hana', last: 'Hr' },
    noProfile: { role: RoleName.EMPLOYEE, org: orgId, first: null, last: null },
    foreign: { role: RoleName.ADMIN, org: otherOrgId, first: 'Fred', last: 'Foreign' },
    remote: { role: RoleName.EMPLOYEE, org: orgId, first: 'Remy', last: 'Remote' },
    onsite: { role: RoleName.EMPLOYEE, org: orgId, first: 'Owen', last: 'Onsite' },
  } as const;
  type Who = keyof typeof people;
  const roleIds = new Map<RoleName, number>();

  function token(who: Who): string {
    const person = people[who];
    return jwt.sign({
      tokenType: 'ACCESS',
      userId: id(`u-${who}`),
      organizationId: person.org,
      roleId: roleIds.get(person.role),
      roleLevel: person.role,
      email: null,
      isAdminOrg: false,
    });
  }

  function api(who: Who) {
    const headers = (req: request.Test) =>
      req
        .set('x-gemba-proxy-secret', PROXY_SECRET)
        .set('x-gemba-tenant-hostname', `${slug}.${BASE_DOMAIN}`)
        .set('authorization', `Bearer ${token(who)}`);
    const server = app.getHttpServer();
    return {
      get: (path: string) => headers(request(server).get(path)),
      post: (path: string, body?: object) => headers(request(server).post(path)).send(body ?? {}),
      patch: (path: string, body: object) => headers(request(server).patch(path)).send(body),
      delete: (path: string) => headers(request(server).delete(path)),
    };
  }

  const emp = (who: Who) => id(`e-${who}`);

  beforeAll(async () => {
    const target = new URL(url!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55443' || target.pathname !== '/work_test') {
      throw new Error('Use the disposable local work_test database on port 55443');
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await db.$connect();

    const [index] = await db.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'AttendanceRecord_one_open_per_employee') AS found`;
    if (!index.found) throw new Error('Apply migrations with `prisma migrate deploy`; `db push` skips the work constraints');

    for (const [name, roleId] of [[RoleName.ADMIN, 2], [RoleName.EMPLOYEE, 5], [RoleName.HR, 6]] as const) {
      const role = await db.role.upsert({ where: { name }, update: {}, create: { id: roleId, name } });
      roleIds.set(name, role.id);
    }
    await db.organization.create({ data: { id: orgId, name: 'Work test', slug, modules: [ModuleType.WORK] } });
    await db.organization.create({ data: { id: otherOrgId, name: 'Other test', slug: `${slug}-other` } });

    for (const [who, person] of Object.entries(people) as [Who, (typeof people)[Who]][]) {
      const userId = id(`u-${who}`);
      await db.user.create({ data: { id: userId, name: who, phone: `work-test-${userId}`, email: null } });
      await db.userOrganization.create({ data: { userId, organizationId: person.org, roleId: roleIds.get(person.role)! } });
      if (person.first) {
        await db.employee.create({
          data: { id: emp(who), userId, organizationId: person.org, firstName: person.first, lastName: person.last },
        });
      }
    }

    Object.assign(process.env, {
      DATABASE_URL: url,
      JWT_SECRET,
      TENANT_PROXY_SECRET: PROXY_SECRET,
      TENANT_BASE_DOMAIN: BASE_DOMAIN,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), WorkModule],
      providers: [{ provide: APP_GUARD, useClass: ProxySecretGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    // Mirrors main.ts.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
  }, 60_000);

  afterAll(async () => {
    // PrismaService has no shutdown hook, so its pool would keep Jest alive.
    await app?.get(PrismaService).$disconnect();
    await app?.close();
    if (!db) return;
    const orgs = { organizationId: { in: [orgId, otherOrgId] } };
    await db.workHomeLocationRequest.deleteMany({ where: orgs });
    await db.workEmployeeProfile.deleteMany({ where: orgs });
    await db.workSite.deleteMany({ where: orgs });
    await db.workHoliday.deleteMany({ where: orgs });
    await db.workSettings.deleteMany({ where: orgs });
    await db.leaveSettings.deleteMany({ where: orgs });
    await db.attendanceCorrection.deleteMany({ where: orgs });
    await db.attendanceRecord.deleteMany({ where: orgs });
    await db.workProject.deleteMany({ where: orgs });
    await db.employee.deleteMany({ where: orgs });
    await db.userOrganization.deleteMany({ where: orgs });
    await db.user.deleteMany({ where: { id: { in: Object.keys(people).map((who) => id(`u-${who}`)) } } });
    await db.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await db.$disconnect();
  });

  describe('access', () => {
    it('rejects a missing proxy secret', async () => {
      await request(app.getHttpServer()).get('/work/projects').expect(401);
    });

    it('requires an employee profile', async () => {
      await api('noProfile').get('/work/projects').expect(403);
    });

    it('rejects a token from another company', async () => {
      const res = await api('foreign').get('/work/projects');
      expect([401, 403, 404]).toContain(res.status);
    });

    it('requires the WORK module', async () => {
      await db.organization.update({ where: { id: orgId }, data: { modules: [] } });
      try {
        await api('admin').get('/work/projects').expect(403);
      } finally {
        await db.organization.update({ where: { id: orgId }, data: { modules: [ModuleType.WORK] } });
      }
    });
  });

  // The blocks below share state and run in order.
  describe('projects, tasks and sprints', () => {
    let projectId: string;
    let datedTask: string;
    let undatedTask: string;
    let sprintId: string;

    it('creates a project with the creator as manager', async () => {
      const { body } = await api('admin')
        .post('/work/projects', { name: '  Launch ', members: [{ employeeId: emp('member') }] })
        .expect(201);
      expect(body).toMatchObject({ name: 'Launch', myRole: 'MANAGER', canManage: true });
      expect(body.members).toHaveLength(2);
      projectId = body.id;
    });

    it('limits project creation by role and company', async () => {
      await api('member').post('/work/projects', { name: 'X' }).expect(403);
      const { body } = await api('admin')
        .post('/work/projects', { name: 'X', members: [{ employeeId: emp('foreign') }] })
        .expect(400);
      expect(body.code).toBe('EMPLOYEE_NOT_IN_COMPANY');
    });

    it('shows projects only to members, and hides them from others', async () => {
      const { body } = await api('member').get('/work/projects').expect(200);
      expect(body.total).toBe(1);
      expect(body.items[0]).toMatchObject({ id: projectId, canManage: false });

      await api('outsider').get(`/work/projects/${projectId}`).expect(404);
      await api('foreign').get(`/work/projects/${projectId}`).expect((res) => expect(res.status).not.toBe(200));
    });

    it('only lets managers edit a project, which keeps at least one manager', async () => {
      await api('member').patch(`/work/projects/${projectId}`, { name: 'Y' }).expect(403);
      const { body } = await api('admin')
        .patch(`/work/projects/${projectId}`, { members: [{ employeeId: emp('member') }] })
        .expect(400);
      expect(body.code).toBe('PROJECT_NEEDS_MANAGER');
    });

    it('lets members create tasks for project members only', async () => {
      const dated = await api('member')
        .post(`/work/projects/${projectId}/tasks`, { title: 'Write docs', assigneeId: emp('member'), dueDate: '2026-10-01' })
        .expect(201);
      expect(dated.body).toMatchObject({ status: 'TODO', dueDate: '2026-10-01' });
      datedTask = dated.body.id;

      const undated = await api('admin')
        .post(`/work/projects/${projectId}/tasks`, { title: 'Later', assigneeId: emp('member') })
        .expect(201);
      undatedTask = undated.body.id;

      const { body } = await api('admin')
        .post(`/work/projects/${projectId}/tasks`, { title: 'Z', assigneeId: emp('outsider') })
        .expect(400);
      expect(body.code).toBe('ASSIGNEE_NOT_MEMBER');
      await api('admin').post(`/work/projects/${projectId}/tasks`, { title: 'Z', dueDate: '2026-02-30' }).expect(400);
      await api('admin').post(`/work/projects/${projectId}/tasks`, { title: '   ' }).expect(400);
    });

    it('refuses to remove a member who still has tasks, and lists them', async () => {
      const { body } = await api('admin')
        .patch(`/work/projects/${projectId}`, { members: [{ employeeId: emp('admin'), role: 'MANAGER' }] })
        .expect(409);
      expect(body.code).toBe('MEMBER_HAS_ASSIGNED_TASKS');
      expect(body.tasks.map((t: { id: string }) => t.id).sort()).toEqual([datedTask, undatedTask].sort());
    });

    it('sorts my tasks by due date with undated last', async () => {
      const { body } = await api('member').get('/work/my-tasks').expect(200);
      expect(body.items.map((t: { id: string }) => t.id)).toEqual([datedTask, undatedTask]);
      expect(body.items[0].project.name).toBe('Launch');
    });

    it('keeps tasks and comments private to the project', async () => {
      await api('outsider').get(`/work/tasks/${datedTask}`).expect(404);
      await api('outsider').post(`/work/tasks/${datedTask}/comments`, { body: 'hi' }).expect(404);

      const { body } = await api('member').post(`/work/tasks/${datedTask}/comments`, { body: 'On it' }).expect(201);
      expect(body.author.name).toBe('Mary Member');
      await api('member').post(`/work/tasks/${datedTask}/comments`, { body: '   ' }).expect(400);
      const list = await api('member').get(`/work/tasks/${datedTask}/comments`).expect(200);
      expect(list.body.total).toBe(1);
    });

    it('lets only managers create sprints and schedule tasks', async () => {
      await api('member')
        .post(`/work/projects/${projectId}/sprints`, { name: 'S', startDate: '2026-10-15', endDate: '2026-10-16' })
        .expect(403);
      const bad = await api('admin')
        .post(`/work/projects/${projectId}/sprints`, { name: 'S', startDate: '2026-10-15', endDate: '2026-10-01' })
        .expect(400);
      expect(bad.body.code).toBe('SPRINT_DATES_INVALID');

      const { body } = await api('admin')
        .post(`/work/projects/${projectId}/sprints`, { name: 'S1', startDate: '2026-10-01', endDate: '2026-10-14' })
        .expect(201);
      expect(body).toMatchObject({ status: 'PLANNED', taskCounts: { total: 0, done: 0, percent: 0 } });
      sprintId = body.id;

      await api('member').patch(`/work/tasks/${datedTask}`, { sprintId }).expect(403);
      await api('admin').patch(`/work/tasks/${datedTask}`, { sprintId }).expect(200);
      await api('admin').patch(`/work/tasks/${undatedTask}`, { sprintId }).expect(200);

      const bySprint = await api('member').get(`/work/projects/${projectId}/tasks?view=${sprintId}`).expect(200);
      expect(bySprint.body.total).toBe(2);
      const unscheduled = await api('member').get(`/work/projects/${projectId}/tasks?view=unscheduled`).expect(200);
      expect(unscheduled.body.total).toBe(0);
    });

    it('runs several sprints at once in one project', async () => {
      const other = await api('admin')
        .post(`/work/projects/${projectId}/sprints`, { name: 'S2', startDate: '2026-10-15', endDate: '2026-10-28' })
        .expect(201);
      await api('admin').post(`/work/sprints/${sprintId}/start`).expect(200);
      await api('admin').post(`/work/sprints/${other.body.id}/start`).expect(200);

      const edit = await api('admin').patch(`/work/sprints/${sprintId}`, { name: 'x' }).expect(409);
      expect(edit.body.code).toBe('SPRINT_NOT_PLANNED');

      const project = await api('member').get(`/work/projects/${projectId}`).expect(200);
      expect(project.body.activeSprints).toEqual([
        { id: sprintId, name: 'S1' },
        { id: other.body.id, name: 'S2' },
      ]);
      await api('admin').post(`/work/sprints/${other.body.id}/complete`).expect(200);
    });

    it('completes a sprint with a frozen snapshot and returns unfinished work to the backlog', async () => {
      await api('member').patch(`/work/tasks/${datedTask}`, { status: 'DONE' }).expect(200);

      const { body } = await api('admin').post(`/work/sprints/${sprintId}/complete`).expect(200);
      expect(body.status).toBe('COMPLETED');
      expect(body.taskCounts).toEqual({ total: 2, done: 1, percent: 50 });
      expect(body.completionSnapshot).toMatchObject({ version: 1, totalCount: 2, completedCount: 1 });

      const again = await api('admin').post(`/work/sprints/${sprintId}/complete`).expect(409);
      expect(again.body.code).toBe('SPRINT_NOT_ACTIVE');
      const undated = await api('member').get(`/work/tasks/${undatedTask}`).expect(200);
      expect(undated.body.sprint).toBeNull();
    });

    it('moves a reopened task out of a completed sprint without changing the snapshot', async () => {
      const { body } = await api('member').patch(`/work/tasks/${datedTask}`, { status: 'IN_PROGRESS' }).expect(200);
      expect(body.sprint).toBeNull();

      const sprint = await api('member').get(`/work/sprints/${sprintId}`).expect(200);
      expect(sprint.body.taskCounts.done).toBe(1);
      expect(sprint.body.completionSnapshot.tasks).toHaveLength(2);

      const assign = await api('admin').patch(`/work/tasks/${datedTask}`, { sprintId }).expect(400);
      expect(assign.body.code).toBe('SPRINT_NOT_ASSIGNABLE');
    });

    it('completes an empty sprint without dividing by zero', async () => {
      const { body: empty } = await api('admin')
        .post(`/work/projects/${projectId}/sprints`, { name: 'Empty', startDate: '2026-11-01', endDate: '2026-11-02' })
        .expect(201);
      await api('admin').post(`/work/sprints/${empty.id}/start`).expect(200);
      const { body } = await api('admin').post(`/work/sprints/${empty.id}/complete`).expect(200);
      expect(body.taskCounts).toEqual({ total: 0, done: 0, percent: 0 });
    });
  });

  describe('attendance', () => {
    const location = { latitude: -1.2833, longitude: 36.8167, accuracyMeters: 12, capturedAt: new Date().toISOString() };
    const missing = { locationStatus: 'MISSING', locationMissingReason: 'Phone had no GPS signal' };
    let recordId: string;
    let clockInAt: string;
    let clockOutAt: string;

    it('validates the location shape', async () => {
      await api('member').post('/work/attendance/clock-in', { requestId: randomUUID(), locationStatus: 'CAPTURED' }).expect(400);
      await api('member')
        .post('/work/attendance/clock-in', { requestId: randomUUID(), locationStatus: 'CAPTURED', location, locationMissingReason: 'GPS was off today' })
        .expect(400);
      await api('member')
        .post('/work/attendance/clock-in', { requestId: randomUUID(), locationStatus: 'MISSING', locationMissingReason: 'short' })
        .expect(400);
    });

    it('records the caller, ignores a body employeeId and leaves out coordinates', async () => {
      const { body } = await api('member')
        .post('/work/attendance/clock-in', { requestId: randomUUID(), locationStatus: 'CAPTURED', location, employeeId: emp('admin') })
        .expect(200);
      // No company sites exist yet, so there is nothing to check against.
      expect(body).toMatchObject({ employeeId: emp('member'), isOpen: true, locationStatus: 'CAPTURED', locationCheck: 'NO_APPROVED_PLACE' });
      expect(body).not.toHaveProperty('latitude');
      recordId = body.id;
      clockInAt = body.clockInAt;
    });

    it('returns the same record for concurrent retries of one request', async () => {
      const requestId = randomUUID();
      const outsider = api('outsider');
      const results = await Promise.all(
        [1, 2, 3].map(() => outsider.post('/work/attendance/clock-in', { requestId, ...missing })),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await db.attendanceRecord.count({ where: { employeeId: emp('outsider') } })).toBe(1);
    });

    it('refuses a second open record', async () => {
      const { body } = await api('member').post('/work/attendance/clock-in', { requestId: randomUUID(), ...missing }).expect(409);
      expect(body).toMatchObject({ code: 'ATTENDANCE_ALREADY_OPEN', recordId });
    });

    it('reports status without caching', async () => {
      const res = await api('member').get('/work/attendance/me/status').expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ timeZone: 'Africa/Nairobi', openRecord: { id: recordId } });
    });

    it('lets only the owner clock out, idempotently', async () => {
      await api('outsider').post(`/work/attendance/${recordId}/clock-out`, { requestId: randomUUID() }).expect(404);

      const { body } = await api('member').post(`/work/attendance/${recordId}/clock-out`, { requestId: randomUUID() }).expect(200);
      expect(body).toMatchObject({ isOpen: false, version: 2 });
      expect(Number.isInteger(body.durationSeconds)).toBe(true);
      clockOutAt = body.clockOutAt;

      const again = await api('member').post(`/work/attendance/${recordId}/clock-out`, { requestId: randomUUID() }).expect(200);
      expect(again.body.clockOutAt).toBe(clockOutAt);
    });

    it('allows one record per work day', async () => {
      const { body } = await api('member').post('/work/attendance/clock-in', { requestId: randomUUID(), ...missing }).expect(409);
      expect(body.code).toBe('ATTENDANCE_DAY_COMPLETED');
    });

    it('returns coordinates only to the owner and attendance managers', async () => {
      const mine = await api('member').get('/work/attendance/me').expect(200);
      expect(mine.body.total).toBe(1);
      expect(JSON.stringify(mine.body)).not.toContain('36.8167');

      const own = await api('member').get(`/work/attendance/${recordId}/location`).expect(200);
      expect(own.body).toMatchObject({ latitude: -1.2833, longitude: 36.8167 });
      await api('hr').get(`/work/attendance/${recordId}/location`).expect(200);

      // Being in the same company does not reveal someone else's location.
      await api('outsider').get(`/work/attendance/${recordId}/location`).expect(404);
    });

    it('limits the team view to attendance managers', async () => {
      await api('member').get('/work/attendance/team').expect(403);
      const { body } = await api('hr').get(`/work/attendance/team?employeeId=${emp('member')}`).expect(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].employee.name).toBe('Mary Member');

      const range = await api('hr').get('/work/attendance/team?from=2026-10-10&to=2026-10-01').expect(400);
      expect(range.body.code).toBe('DATE_RANGE_INVALID');
    });

    describe('corrections', () => {
      const earlier = () => new Date(new Date(clockInAt).getTime() - 60_000).toISOString();
      const correct = (who: Who, body: object) => api(who).post(`/work/attendance/${recordId}/corrections`, body);

      it('is limited to attendance managers', async () => {
        await correct('member', { clockInAt: earlier(), reason: 'Arrived earlier', expectedVersion: 2 }).expect(403);
      });

      it('rejects stale versions and invalid times', async () => {
        const stale = await correct('hr', { clockInAt: earlier(), reason: 'Arrived earlier', expectedVersion: 1 }).expect(409);
        expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', currentVersion: 2 });

        await correct('hr', { clockInAt: '2026-10-05T08:00:00', reason: 'No offset given', expectedVersion: 2 }).expect(400);

        const future = await correct('hr', {
          clockOutAt: new Date(Date.now() + 3_600_000).toISOString(),
          reason: 'Left later today',
          expectedVersion: 2,
        }).expect(400);
        expect(future.body.code).toBe('ATTENDANCE_CORRECTION_INVALID');

        const otherDay = await correct('hr', { clockInAt: '2026-09-01T08:00:00+03:00', reason: 'Wrong day entirely', expectedVersion: 2 }).expect(400);
        expect(otherDay.body.code).toBe('ATTENDANCE_CORRECTION_INVALID');

        const backwards = await correct('hr', { clockOutAt: earlier(), reason: 'Out before in', expectedVersion: 2 }).expect(400);
        expect(backwards.body.code).toBe('ATTENDANCE_CORRECTION_INVALID');

        await correct('hr', { clockInAt: earlier(), reason: 'late', expectedVersion: 2 }).expect(400);
      });

      it('applies a correction, marks it edited and records history', async () => {
        const inAt = earlier();
        const { body } = await correct('hr', { clockInAt: inAt, reason: 'Arrived earlier, badge failed', expectedVersion: 2 }).expect(201);
        expect(body).toMatchObject({ edited: true, version: 3, clockInAt: inAt, clockOutAt });

        const history = await api('member').get(`/work/attendance/${recordId}/corrections`).expect(200);
        expect(history.body).toHaveLength(1);
        expect(history.body[0]).toMatchObject({ previousClockInAt: clockInAt, correctedClockInAt: inAt, correctedBy: { name: 'Hana Hr' } });
        await api('outsider').get(`/work/attendance/${recordId}/corrections`).expect(404);
      });

      it('accepts only one of two concurrent corrections at the same version', async () => {
        const results = await Promise.all(
          [120_000, 180_000].map((ms) =>
            correct('hr', {
              clockInAt: new Date(new Date(clockInAt).getTime() - ms).toISOString(),
              reason: 'Concurrent correction',
              expectedVersion: 3,
            }),
          ),
        );
        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await db.attendanceCorrection.count({ where: { attendanceRecordId: recordId } })).toBe(2);
      });
    });
  });

  describe('schedule, holidays, team and analytics', () => {
    const missing = { locationStatus: 'MISSING', locationMissingReason: 'Phone had no GPS signal' };
    const year = new Date().getUTCFullYear();

    it('lets everyone read the schedule but only settings roles change it', async () => {
      const { body } = await api('member').get('/work/settings').expect(200);
      expect(body).toMatchObject({ workStartTime: '09:00', workEndTime: '17:00', lunchBreakEnabled: false, canEdit: false });
      await api('member').patch('/work/settings', { workStartTime: '08:00' }).expect(403);

      const backwards = await api('hr').patch('/work/settings', { workStartTime: '18:00' }).expect(400);
      expect(backwards.body.code).toBe('SETTINGS_INVALID');
      const noLunchTimes = await api('hr').patch('/work/settings', { lunchBreakEnabled: true }).expect(400);
      expect(noLunchTimes.body.code).toBe('SETTINGS_INVALID');
      await api('hr').patch('/work/settings', { workStartTime: '25:00' }).expect(400);
    });

    it('saves hours, lunch and working days, sharing working days with Leave', async () => {
      // Every day is a working day and work starts at midnight, so any clock-in today is late.
      const { body } = await api('admin')
        .patch('/work/settings', {
          workStartTime: '00:00',
          workEndTime: '23:59',
          lateGraceMinutes: 0,
          lunchBreakEnabled: true,
          lunchStartTime: '13:00',
          lunchEndTime: '14:00',
          workingDays: [0, 1, 2, 3, 4, 5, 6],
        })
        .expect(200);
      expect(body).toMatchObject({ lunchBreakEnabled: true, scheduledMinutesPerDay: 1439 - 60, canEdit: true });
      const leave = await db.leaveSettings.findUnique({ where: { organizationId: orgId } });
      expect(leave?.workingDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('imports a public holiday calendar and protects public holidays', async () => {
      const unsupported = await api('admin').patch('/work/settings', { holidayCountry: 'ZZ' }).expect(400);
      expect(unsupported.body.code).toBe('HOLIDAY_COUNTRY_UNSUPPORTED');

      await api('admin').patch('/work/settings', { holidayCountry: 'KE' }).expect(200);
      const { body } = await api('member').get(`/work/holidays?year=${year}`).expect(200);
      expect(body.country).toBe('KE');
      const jamhuri = body.items.find((h: { date: string }) => h.date === `${year}-12-12`);
      expect(jamhuri).toMatchObject({ source: 'PUBLIC', isActive: true });

      const locked = await api('admin').delete(`/work/holidays/${jamhuri.id}`).expect(400);
      expect(locked.body.code).toBe('PUBLIC_HOLIDAY_LOCKED');
      const moved = await api('admin').patch(`/work/holidays/${jamhuri.id}`, { date: `${year}-12-13` }).expect(400);
      expect(moved.body.code).toBe('PUBLIC_HOLIDAY_LOCKED');
      await api('admin').patch(`/work/holidays/${jamhuri.id}`, { isActive: false }).expect(200);

      const again = await api('admin').post('/work/holidays/import', { year }).expect(200);
      expect(again.body.added).toBe(0);
      const still = again.body.items.find((h: { id: string }) => h.id === jamhuri.id);
      expect(still.isActive).toBe(false);
    });

    it('manages company holidays', async () => {
      await api('member').post('/work/holidays', { date: `${year}-12-24`, name: 'Office closed' }).expect(403);
      const { body } = await api('admin').post('/work/holidays', { date: `${year}-12-24`, name: 'Office closed' }).expect(201);
      expect(body).toMatchObject({ source: 'COMPANY', name: 'Office closed' });

      const dup = await api('admin').post('/work/holidays', { date: `${year}-12-24`, name: 'Again' }).expect(409);
      expect(dup.body.code).toBe('HOLIDAY_EXISTS');
      await api('admin').patch(`/work/holidays/${body.id}`, { date: `${year}-12-23` }).expect(200);
      await api('admin').delete(`/work/holidays/${body.id}`).expect(200);
    });

    it('saves the schedule on a clock-in and reports lateness from it', async () => {
      const status = await api('hr').get('/work/attendance/me/status').expect(200);
      const { body } = await api('hr').post('/work/attendance/clock-in', { requestId: randomUUID(), ...missing }).expect(200);
      const row = await db.attendanceRecord.findUniqueOrThrow({ where: { id: body.id } });

      if (status.body.todaySchedule.dayType === 'WORKING') {
        expect(row).toMatchObject({ scheduledBreakMinutes: 60, lateGraceMinutes: 0 });
        expect(body.scheduledStartAt).toBe(status.body.todaySchedule.startsAt);
        expect(body.lateMinutes).toBeGreaterThan(0);
      } else {
        // Today is a public holiday in the test run: nothing is scheduled, so nobody is late.
        expect(row.scheduledStartAt).toBeNull();
        expect(body.lateMinutes).toBe(0);
      }

      // Later settings changes never rewrite the saved schedule.
      await api('admin').patch('/work/settings', { workStartTime: '12:00', lunchStartTime: '13:00' }).expect(200);
      const after = await db.attendanceRecord.findUniqueOrThrow({ where: { id: body.id } });
      expect(after.scheduledStartAt).toEqual(row.scheduledStartAt);
      await api('admin').patch('/work/settings', { workStartTime: '00:00' }).expect(200);
    });

    it('shows a reporting manager their direct reports only', async () => {
      await db.employee.update({ where: { id: emp('member') }, data: { reportingManagerId: emp('outsider') } });

      const me = await api('outsider').get('/work/me').expect(200);
      expect(me.body).toMatchObject({ directReportCount: 1, canManageAttendance: false, analyticsScopes: ['personal'] });

      const team = await api('outsider').get('/work/team').expect(200);
      expect(team.body.map((m: { name: string }) => m.name)).toEqual(['Mary Member']);
      expect(team.body[0]).toMatchObject({ tasks: { open: expect.any(Number) }, attendance: { presentDays: expect.any(Number) } });
      await api('outsider').get(`/work/team/${emp('member')}`).expect(200);
      await api('outsider').get(`/work/team/${emp('hr')}`).expect(404);
      expect((await api('member').get('/work/team').expect(200)).body).toEqual([]);

      // Attendance follows the same relationship; corrections stay with attendance managers.
      const records = await api('outsider').get('/work/attendance/team').expect(200);
      expect(new Set(records.body.items.map((r: { employeeId: string }) => r.employeeId))).toEqual(new Set([emp('member')]));
      await api('outsider').get(`/work/attendance/team?employeeId=${emp('hr')}`).expect(404);
      const memberRecord = records.body.items[0].id;
      await api('outsider').get(`/work/attendance/${memberRecord}/location`).expect(200);
      await api('outsider')
        .post(`/work/attendance/${memberRecord}/corrections`, { reason: 'Not allowed', expectedVersion: 1 })
        .expect(403);
    });

    it('limits analytics scopes by role and relationship', async () => {
      const mine = await api('member').get('/work/analytics?scope=personal').expect(200);
      expect(mine.body).toMatchObject({ scope: 'personal', headcount: 1, subject: { employee: { id: emp('member') } } });
      expect(mine.body.attendance.presentDays).toBeGreaterThanOrEqual(0);

      await api('member').get('/work/analytics?scope=organisation').expect(403);
      await api('member').get('/work/analytics?scope=department').expect(403);
      await api('member').get(`/work/analytics?scope=personal&employeeId=${emp('outsider')}`).expect(404);
      await api('outsider').get(`/work/analytics?scope=personal&employeeId=${emp('member')}`).expect(200);
      await api('member').get('/work/analytics?scope=everything').expect(400);

      const tooLong = await api('admin').get('/work/analytics?scope=organisation&from=2025-01-01&to=2026-06-01').expect(400);
      expect(tooLong.body.code).toBe('DATE_RANGE_TOO_LONG');
      const noDept = await api('admin').get('/work/analytics?scope=department').expect(400);
      expect(noDept.body.code).toBe('DEPARTMENT_REQUIRED');
    });

    it('reports projects and tasks finished on time or late', async () => {
      const project = await api('admin').post('/work/projects', { name: 'Analytics', targetDate: '2026-01-31' }).expect(201);
      expect(project.body).toMatchObject({ status: 'ACTIVE', targetDate: '2026-01-31', completedAt: null });

      const lead = await api('admin')
        .post(`/work/projects/${project.body.id}/sprints`, { name: 'S', startDate: '2026-01-01', endDate: '2026-01-14', leadId: emp('member') })
        .expect(400);
      expect(lead.body.code).toBe('SPRINT_MEMBER_NOT_IN_PROJECT');
      const sprint = await api('admin')
        .post(`/work/projects/${project.body.id}/sprints`, { name: 'S', startDate: '2026-01-01', endDate: '2026-01-14', leadId: emp('admin') })
        .expect(201);
      expect(sprint.body.lead).toEqual({ id: emp('admin'), name: 'Ada Admin' });
      expect(sprint.body.members).toEqual([{ id: emp('admin'), name: 'Ada Admin' }]);

      const late = await api('admin')
        .post(`/work/projects/${project.body.id}/tasks`, { title: 'Late', dueDate: '2026-01-02', assigneeId: emp('admin') })
        .expect(201);
      const done = await api('admin').patch(`/work/tasks/${late.body.id}`, { status: 'DONE' }).expect(200);
      expect(done.body.completedAt).not.toBeNull();
      const reopened = await api('admin').patch(`/work/tasks/${late.body.id}`, { status: 'TODO' }).expect(200);
      expect(reopened.body.completedAt).toBeNull();
      await api('admin').patch(`/work/tasks/${late.body.id}`, { status: 'DONE' }).expect(200);

      const before = await api('admin').get('/work/analytics?scope=organisation').expect(200);
      expect(before.body.projects.projectsOverdue.map((p: { id: string }) => p.id)).toContain(project.body.id);

      const completed = await api('admin').patch(`/work/projects/${project.body.id}`, { status: 'COMPLETED' }).expect(200);
      expect(completed.body.completedAt).not.toBeNull();
      const again = await api('admin').patch(`/work/projects/${project.body.id}`, { status: 'COMPLETED' }).expect(200);
      expect(again.body.completedAt).toBe(completed.body.completedAt);

      const { body } = await api('admin').get('/work/analytics?scope=organisation').expect(200);
      expect(body.projects.tasksCompleted.late).toBeGreaterThanOrEqual(1);
      const outcome = body.projects.projectsCompleted.items.find((p: { id: string }) => p.id === project.body.id);
      expect(outcome.daysLate).toBeGreaterThan(0);
      expect(body.projects.projectsCompleted.late).toBeGreaterThanOrEqual(1);
      expect(body.breakdown.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('locations', () => {
    // About 4 km apart. 0.001° of latitude is about 111 m.
    const OFFICE = { latitude: -1.2864, longitude: 36.8172 };
    const ELSEWHERE = { latitude: -1.3, longitude: 36.85 };
    const HOME = { latitude: -1.25, longitude: 36.78 };
    const at = (point: { latitude: number; longitude: number }, accuracyMeters = 15) => ({
      ...point,
      accuracyMeters,
      capturedAt: new Date().toISOString(),
    });
    const clockInAt = (point: { latitude: number; longitude: number }) => ({ requestId: randomUUID(), locationStatus: 'CAPTURED', location: at(point) });

    it('lets everyone see active company sites but only settings roles manage them', async () => {
      await api('member').post('/work/locations/sites', { name: 'Head office', ...OFFICE }).expect(403);
      const created = await api('admin').post('/work/locations/sites', { name: 'Head office', ...OFFICE, radiusMeters: 200 }).expect(201);
      expect(created.body).toMatchObject({ name: 'Head office', radiusMeters: 200, isActive: true });
      const duplicate = await api('hr').post('/work/locations/sites', { name: 'Head office', ...ELSEWHERE }).expect(409);
      expect(duplicate.body.code).toBe('SITE_EXISTS');
      await api('admin').post('/work/locations/sites', { name: 'Tiny', ...ELSEWHERE, radiusMeters: 5 }).expect(400);

      const old = await api('admin').post('/work/locations/sites', { name: 'Old depot', ...ELSEWHERE }).expect(201);
      await api('admin').patch(`/work/locations/sites/${old.body.id}`, { isActive: false }).expect(200);
      await api('foreign').patch(`/work/locations/sites/${old.body.id}`, { isActive: true }).expect(403);

      const seen = await api('member').get('/work/locations').expect(200);
      expect(seen.body).toMatchObject({ homeRadiusMeters: 150, canEdit: false });
      expect(seen.body.sites.map((s: { name: string }) => s.name)).toEqual(['Head office']);
      const admin = await api('admin').get('/work/locations').expect(200);
      expect(admin.body.sites.map((s: { name: string }) => s.name)).toEqual(['Head office', 'Old depot']);
      await api('member').patch('/work/locations', { homeRadiusMeters: 300 }).expect(403);
    });

    it('allows but flags an on-site clock-in away from every company site', async () => {
      const { body } = await api('onsite').post('/work/attendance/clock-in', clockInAt(ELSEWHERE)).expect(200);
      expect(body).toMatchObject({ locationCheck: 'OUTSIDE', checkedPlaceKind: 'SITE', checkedPlaceName: 'Head office' });
      expect(body.distanceMeters).toBeGreaterThan(3_000);
      expect(body).not.toHaveProperty('checkedPlaceLatitude');

      // The inactive depot at the same spot is not a place anyone may use.
      const location = await api('hr').get(`/work/attendance/${body.id}/location`).expect(200);
      expect(location.body).toMatchObject({
        locationCheck: 'OUTSIDE',
        arrangementAtClockIn: 'ON_SITE',
        checkedPlace: { kind: 'SITE', name: 'Head office', ...OFFICE, radiusMeters: 200 },
      });

      const stats = await api('hr').get(`/work/analytics?scope=personal&employeeId=${emp('onsite')}`).expect(200);
      expect(stats.body.attendance.outsideLocationDays).toBe(1);
    });

    it('lets a remote employee capture a home that their manager approves', async () => {
      const refused = await api('remote').post('/work/locations/me/home-request', { location: at(HOME) }).expect(400);
      expect(refused.body.code).toBe('HOME_NOT_ALLOWED');

      await api('member').patch(`/work/locations/arrangements/${emp('remote')}`, { arrangement: 'REMOTE' }).expect(403);
      await api('admin').patch(`/work/locations/arrangements/${emp('foreign')}`, { arrangement: 'REMOTE' }).expect(404);
      await api('hr').patch(`/work/locations/arrangements/${emp('remote')}`, { arrangement: 'REMOTE' }).expect(200);
      const list = await api('hr').get('/work/locations/arrangements?search=remy').expect(200);
      expect(list.body.items).toEqual([expect.objectContaining({ employee: { id: emp('remote'), name: 'Remy Remote' }, arrangement: 'REMOTE', hasHome: false })]);
      const onsiteOnly = await api('hr').get('/work/locations/arrangements?arrangement=ON_SITE').expect(200);
      expect(onsiteOnly.body.items.map((r: { employee: { id: string } }) => r.employee.id)).toContain(emp('onsite'));
      expect(onsiteOnly.body.items.map((r: { employee: { id: string } }) => r.employee.id)).not.toContain(emp('remote'));

      const vague = await api('remote').post('/work/locations/me/home-request', { location: at(HOME, 900) }).expect(400);
      expect(vague.body.code).toBe('LOCATION_TOO_VAGUE');
      await api('remote').post('/work/locations/me/home-request', { location: at(ELSEWHERE) }).expect(200);
      const mine = await api('remote').post('/work/locations/me/home-request', { location: at(HOME), note: 'Moved house' }).expect(200);
      expect(mine.body).toMatchObject({ arrangement: 'REMOTE', home: null, canRequestHome: true, latestRequest: { status: 'PENDING', note: 'Moved house' } });
      // The earlier capture was replaced, not left waiting.
      expect(await db.workHomeLocationRequest.count({ where: { employeeId: emp('remote'), status: 'PENDING' } })).toBe(1);

      // Reviewers: settings roles, or the employee's reporting manager.
      await db.employee.update({ where: { id: emp('remote') }, data: { reportingManagerId: emp('outsider') } });
      await api('member').get('/work/locations/home-requests').expect(403);
      const queue = await api('outsider').get('/work/locations/home-requests').expect(200);
      expect(queue.body).toEqual([expect.objectContaining({ employee: { id: emp('remote'), name: 'Remy Remote' }, ...HOME, currentHome: null })]);
      expect((await api('hr').get('/work/locations/home-requests').expect(200)).body).toHaveLength(1);

      const requestId = queue.body[0].id;
      await api('member').post(`/work/locations/home-requests/${requestId}/review`, { decision: 'APPROVED' }).expect(403);
      await api('outsider').post(`/work/locations/home-requests/${requestId}/review`, { decision: 'MAYBE' }).expect(400);
      const approved = await api('outsider').post(`/work/locations/home-requests/${requestId}/review`, { decision: 'APPROVED' }).expect(200);
      expect(approved.body).toMatchObject({ status: 'APPROVED', reviewedBy: { id: emp('outsider') }, currentHome: HOME });
      const twice = await api('hr').post(`/work/locations/home-requests/${requestId}/review`, { decision: 'REJECTED' }).expect(409);
      expect(twice.body.code).toBe('HOME_REQUEST_NOT_PENDING');

      expect((await api('remote').get('/work/locations/me').expect(200)).body.home).toMatchObject(HOME);

      // Remote means home only: the office would not count, home does.
      const { body } = await api('remote').post('/work/attendance/clock-in', clockInAt(HOME)).expect(200);
      expect(body).toMatchObject({ locationCheck: 'INSIDE', checkedPlaceKind: 'HOME', checkedPlaceName: 'Home', distanceMeters: 0 });
    });

    it('never lets someone approve their own home', async () => {
      await api('admin').patch(`/work/locations/arrangements/${emp('hr')}`, { arrangement: 'HYBRID' }).expect(200);
      await api('hr').post('/work/locations/me/home-request', { location: at(HOME) }).expect(200);
      const [own] = (await api('hr').get('/work/locations/home-requests').expect(200)).body.filter((r: { employee: { id: string } }) => r.employee.id === emp('hr'));
      await api('hr').post(`/work/locations/home-requests/${own.id}/review`, { decision: 'APPROVED' }).expect(403);
      await api('admin').post(`/work/locations/home-requests/${own.id}/review`, { decision: 'REJECTED', note: 'Please capture it again at home' }).expect(200);
      const mine = await api('hr').get('/work/locations/me').expect(200);
      expect(mine.body).toMatchObject({ home: null, latestRequest: { status: 'REJECTED', reviewNote: 'Please capture it again at home' } });
    });
  });
});
