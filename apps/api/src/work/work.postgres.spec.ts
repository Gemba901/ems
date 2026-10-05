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
  // hr: attendance manager; noProfile: no employee record; foreign: another company.
  const people = {
    admin: { role: RoleName.ADMIN, org: orgId, first: 'Ada', last: 'Admin' },
    member: { role: RoleName.EMPLOYEE, org: orgId, first: 'Mary', last: 'Member' },
    outsider: { role: RoleName.EMPLOYEE, org: orgId, first: 'Otto', last: 'Side' },
    hr: { role: RoleName.HR, org: orgId, first: 'Hana', last: 'Hr' },
    noProfile: { role: RoleName.EMPLOYEE, org: orgId, first: null, last: null },
    foreign: { role: RoleName.ADMIN, org: otherOrgId, first: 'Fred', last: 'Foreign' },
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

    it('allows one active sprint per project', async () => {
      const other = await api('admin')
        .post(`/work/projects/${projectId}/sprints`, { name: 'S2', startDate: '2026-10-15', endDate: '2026-10-28' })
        .expect(201);
      await api('admin').post(`/work/sprints/${sprintId}/start`).expect(200);

      const { body } = await api('admin').post(`/work/sprints/${other.body.id}/start`).expect(409);
      expect(body.code).toBe('SPRINT_ALREADY_ACTIVE');
      const edit = await api('admin').patch(`/work/sprints/${sprintId}`, { name: 'x' }).expect(409);
      expect(edit.body.code).toBe('SPRINT_NOT_PLANNED');

      const project = await api('member').get(`/work/projects/${projectId}`).expect(200);
      expect(project.body.activeSprint).toEqual({ id: sprintId, name: 'S1' });
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
      expect(body).toMatchObject({ employeeId: emp('member'), isOpen: true, locationStatus: 'CAPTURED' });
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
});
