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
import { syncAreasFromProfiles } from './five-s-area-sync';
import { FiveSModule } from './five-s.module';

// Explicit opt-in against a disposable local database with migrations applied:
//   FIVE_S_TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/five_s_test npx jest five-s.postgres
const url = process.env.FIVE_S_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

jest.setTimeout(30_000);

const JWT_SECRET = randomBytes(32).toString('hex');
const PROXY_SECRET = randomBytes(32).toString('hex');
const BASE_DOMAIN = 'five-s-test.local';

suite('5S API on PostgreSQL', () => {
    let db: PrismaClient;
    let app: INestApplication;
    const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '10m' } });
    const run = randomUUID().slice(0, 8);
    const orgId = `fives-${run}`;
    const otherOrgId = `fives-other-${run}`;
    const slug = `fives-${run}`;
    // DTOs validate ids as UUIDs, so every fixture id is a real UUID.
    const ids = new Map<string, string>();
    const id = (name: string) => {
        if (!ids.has(name)) ids.set(name, randomUUID());
        return ids.get(name)!;
    };
    const deptA = id('dept-a');
    const deptB = id('dept-b');

    // `section` is the profile's "Work Area / Section": 5S areas are built from it.
    const people = {
        admin: { role: RoleName.ADMIN, org: orgId, dept: null, section: null },
        hod: { role: RoleName.HOD, org: orgId, dept: deptA, section: 'Press Line' },
        owner: { role: RoleName.EMPLOYEE, org: orgId, dept: deptA, section: 'Press Line' },
        worker: { role: RoleName.EMPLOYEE, org: orgId, dept: deptA, section: ' press  line ' },
        outsider: { role: RoleName.EMPLOYEE, org: orgId, dept: deptB, section: null },
        mgmt: { role: RoleName.MANAGEMENT, org: orgId, dept: null, section: 'Press Line' },
        foreign: { role: RoleName.ADMIN, org: otherOrgId, dept: null, section: 'Press Line' },
    } as const;
    type Who = keyof typeof people;
    const roleIds = new Map<RoleName, number>();
    const emp = (who: Who) => id(`e-${who}`);

    function api(who: Who) {
        const p = people[who];
        const token = jwt.sign({
            tokenType: 'ACCESS', userId: id(`u-${who}`), organizationId: p.org, roleId: roleIds.get(p.role),
            roleLevel: p.role, email: null, isAdminOrg: false,
        });
        const h = (req: request.Test) =>
            req.set('x-gemba-proxy-secret', PROXY_SECRET).set('x-gemba-tenant-hostname', `${slug}.${BASE_DOMAIN}`).set('authorization', `Bearer ${token}`);
        const server = app.getHttpServer();
        return {
            get: (path: string) => h(request(server).get(path)),
            post: (path: string, body?: object) => h(request(server).post(path)).send(body ?? {}),
            put: (path: string, body: object) => h(request(server).put(path)).send(body),
            patch: (path: string, body: object) => h(request(server).patch(path)).send(body),
            delete: (path: string) => h(request(server).delete(path)),
        };
    }

    beforeAll(async () => {
        const target = new URL(url!);
        if (!['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('Use a disposable local database');
        db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
        await db.$connect();

        for (const [name, roleId] of [[RoleName.ADMIN, 2], [RoleName.MANAGEMENT, 3], [RoleName.HOD, 4], [RoleName.EMPLOYEE, 5]] as const) {
            const role = await db.role.upsert({ where: { name }, update: {}, create: { id: roleId, name } });
            roleIds.set(name, role.id);
        }
        await db.organization.create({ data: { id: orgId, name: '5S test', slug, modules: [ModuleType.FIVE_S] } });
        await db.organization.create({ data: { id: otherOrgId, name: 'Other', slug: `${slug}-other`, modules: [ModuleType.FIVE_S] } });
        await db.department.create({ data: { id: deptA, name: 'Production', organizationId: orgId } });
        await db.department.create({ data: { id: deptB, name: 'Finance', organizationId: orgId } });
        for (const [who, p] of Object.entries(people) as [Who, (typeof people)[Who]][]) {
            const userId = id(`u-${who}`);
            await db.user.create({ data: { id: userId, name: who, phone: `five-s-${userId}`, email: null } });
            await db.userOrganization.create({ data: { userId, organizationId: p.org, roleId: roleIds.get(p.role)! } });
            await db.employee.create({ data: { id: emp(who), userId, organizationId: p.org, firstName: who, lastName: 'Test', departmentId: p.dept, section: p.section } });
        }

        Object.assign(process.env, { DATABASE_URL: url, JWT_SECRET, TENANT_PROXY_SECRET: PROXY_SECRET, TENANT_BASE_DOMAIN: BASE_DOMAIN });
        const moduleRef = await Test.createTestingModule({
            imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), FiveSModule],
            providers: [{ provide: APP_GUARD, useClass: ProxySecretGuard }],
        }).compile();
        app = moduleRef.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
        app.useGlobalFilters(new SafeExceptionFilter());
        await app.init();
    }, 60_000);

    afterAll(async () => {
        await app?.get(PrismaService).$disconnect();
        await app?.close();
        if (!db) return;
        const orgs = { organizationId: { in: [orgId, otherOrgId] } };
        await db.fiveSAction.deleteMany({ where: orgs });
        await db.fiveSAudit.deleteMany({ where: orgs });
        await db.fiveSRedTag.deleteMany({ where: orgs });
        await db.fiveSStandard.deleteMany({ where: orgs });
        await db.fiveSRoutine.deleteMany({ where: orgs });
        await db.fiveSArea.deleteMany({ where: orgs });
        await db.fiveSChangeLog.deleteMany({ where: orgs });
        await db.fiveSResponsibilityAssignment.deleteMany({ where: orgs });
        await db.fiveSCounter.deleteMany({ where: orgs });
        await db.employee.deleteMany({ where: orgs });
        await db.department.deleteMany({ where: orgs });
        await db.userOrganization.deleteMany({ where: orgs });
        await db.user.deleteMany({ where: { id: { in: Object.keys(people).map((who) => id(`u-${who}`)) } } });
        await db.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
        await db.$disconnect();
    });

    const today = new Date().toISOString().slice(0, 10);
    let areaId: string;
    let auditId: string;

    it('builds workplace areas from employee profiles and only lets admins set owner and target', async () => {
        const areas = (await api('admin').get('/five-s/areas').expect(200)).body as { id: string; name: string; department: { id: string } | null }[];
        // One area per distinct section, whitespace and case ignored; department = where most of its people sit.
        expect(areas).toHaveLength(1);
        expect(areas[0]).toMatchObject({ name: 'Press Line', department: { id: deptA } });
        areaId = areas[0].id;
        await api('admin').post('/five-s/areas', { name: 'Nope', auditFrequency: 'MONTHLY', targetLevel: 3 }).expect(404);
        await api('admin').patch(`/five-s/areas/${areaId}`, { targetLevel: 80 }).expect(400);
        expect([403, 404]).toContain((await api('worker').patch(`/five-s/areas/${areaId}`, { targetLevel: 3 })).status);
        await api('admin').patch(`/five-s/areas/${areaId}`, { ownerId: emp('owner'), targetLevel: 3.0 }).expect(200);
        const detail = (await api('owner').get(`/five-s/areas/${areaId}`).expect(200)).body;
        expect(detail).toMatchObject({ name: 'Press Line', targetLevel: 3, latest: null, auditDue: { state: 'NEVER_AUDITED' } });
    });

    it('hides areas from other departments and companies', async () => {
        await api('outsider').get(`/five-s/areas/${areaId}`).expect(404);
        const foreign = await api('foreign').get(`/five-s/areas/${areaId}`);
        expect([401, 403, 404]).toContain(foreign.status);
        await api('mgmt').get(`/five-s/areas/${areaId}`).expect(200);
    });

    it('saves a draft, refuses to submit with blanks, then submits and scores once on the total', async () => {
        await api('worker').post('/five-s/audits', { areaId, auditDate: today }).expect(403);
        const created = (await api('hod').post('/five-s/audits', { areaId, auditDate: today, auditeeName: 'Line leader' }).expect(201)).body;
        auditId = created.id;
        let audit = (await api('hod').get(`/five-s/audits/${auditId}`).expect(200)).body;
        expect(audit).toMatchObject({ status: 'DRAFT', result: null });
        expect(audit.checkpoints).toHaveLength(20);

        // 19 answered: blank is not zero, so submission must fail and name checkpoint 20.
        const counts = [1, 0, 2, 1, 2, 1, 2, 0, 3, 1, 0, 1, 2, 1, 0, 1, 1, 2, 1, 5];
        await api('hod').put(`/five-s/audits/${auditId}/responses`, {
            responses: counts.slice(0, 19).map((c, i) => ({ checkpointNo: i + 1, locationCount: c })),
        }).expect(200);
        const blocked = (await api('hod').post(`/five-s/audits/${auditId}/submit`).expect(400)).body;
        expect(blocked.missing ?? blocked.message).toBeDefined();
        await api('hod').put(`/five-s/audits/${auditId}/responses`, { responses: [{ checkpointNo: 20, locationCount: 6 }] }).expect(400);

        audit = (await api('hod').put(`/five-s/audits/${auditId}/responses`, { responses: [{ checkpointNo: 20, locationCount: 5, remark: 'Five or more' }] }).expect(200)).body;
        expect(audit.progress.answered).toBe(20);

        audit = (await api('hod').post(`/five-s/audits/${auditId}/submit`).expect(201)).body;
        // Sort 4, Set 5, Shine 5, Standardize 4, Sustain 1+2+1+5 = 9; total 27 -> ROUNDUP(27/4)=7 -> 2.8
        expect(audit.result).toMatchObject({
            points: { SORT: 4, SET_IN_ORDER: 5, SHINE: 5, STANDARDIZE: 4, SUSTAIN: 9 },
            totalPoints: 27, deductionSteps: 7, level: 2.8, targetLevel: 3, targetMet: false,
        });
        // One action per non-zero checkpoint (16 of 20).
        expect(audit.checkpoints.filter((c: { action: unknown }) => c.action)).toHaveLength(16);
    });

    it('locks submitted audits', async () => {
        await api('hod').put(`/five-s/audits/${auditId}/responses`, { responses: [{ checkpointNo: 1, locationCount: 0 }] }).expect(409);
        await api('hod').post(`/five-s/audits/${auditId}/submit`).expect(409);
        await api('hod').delete(`/five-s/audits/${auditId}`).expect(409);
    });

    it('completes and verifies an action without changing the audit score', async () => {
        const actions = (await api('owner').get(`/five-s/actions?auditId=${auditId}`).expect(200)).body;
        const action = actions.find((a: { checkpointNo: number }) => a.checkpointNo === 1);
        expect(action).toMatchObject({ status: 'OPEN', dueDate: null, isOverdue: false, owner: { id: emp('owner') } });

        // The area owner plans the action and hands it to a worker, who cannot change the plan.
        await api('owner').patch(`/five-s/actions/${action.id}`, { ownerId: emp('worker') }).expect(200);
        await api('worker').patch(`/five-s/actions/${action.id}`, { dueDate: '2020-01-01' }).expect(403);
        await api('hod').patch(`/five-s/actions/${action.id}`, { dueDate: '2020-01-01' }).expect(200);
        expect((await api('worker').get(`/five-s/actions/${action.id}`)).body.isOverdue).toBe(true);

        // Verification needs at least one corrective action, and every one of them done.
        await api('worker').post(`/five-s/actions/${action.id}/submit`, { completionDescription: 'Scrap removed and bin relocated' }).expect(400);
        const planned = (await api('hod').post(`/five-s/actions/${action.id}/corrective-actions`, { description: 'Remove scrap bin' }).expect(201)).body;
        const [step] = planned.correctiveActions;
        expect(step).toMatchObject({ description: 'Remove scrap bin', owner: { id: emp('worker') }, completedAt: null });
        await api('worker').post(`/five-s/actions/${action.id}/submit`, { completionDescription: 'Scrap removed and bin relocated' }).expect(400);
        await api('worker').patch(`/five-s/actions/${action.id}/corrective-actions/${step.id}`, { dueDate: '2030-01-01' }).expect(403);
        const ticked = (await api('worker').patch(`/five-s/actions/${action.id}/corrective-actions/${step.id}`, { done: true }).expect(200)).body;
        expect(ticked.correctiveActionProgress).toEqual({ done: 1, total: 1 });

        await api('worker').post(`/five-s/actions/${action.id}/submit`, {}).expect(400);
        await api('owner').post(`/five-s/actions/${action.id}/submit`, { completionDescription: 'Done it' }).expect(403);
        await api('worker').post(`/five-s/actions/${action.id}/submit`, { completionDescription: 'Scrap removed and bin relocated' }).expect(201);
        await api('worker').post(`/five-s/actions/${action.id}/verify`, { outcome: 'VERIFIED' }).expect(403);
        await api('hod').post(`/five-s/actions/${action.id}/verify`, { outcome: 'REWORK' }).expect(400);
        const reworked = (await api('hod').post(`/five-s/actions/${action.id}/verify`, { outcome: 'REWORK', remarks: 'Bin is back on the rack' }).expect(201)).body;
        expect(reworked.status).toBe('OPEN');
        await api('worker').post(`/five-s/actions/${action.id}/submit`, { completionDescription: 'Bin removed from site' }).expect(201);
        const verified = (await api('owner').post(`/five-s/actions/${action.id}/verify`, { outcome: 'VERIFIED' }).expect(201)).body;
        expect(verified.status).toBe('VERIFIED');
        expect(verified.history.map((e: { type: string }) => e.type)).toEqual([
            'CREATED', 'ASSIGNED', 'DUE_DATE_CHANGED', 'UPDATED', 'UPDATED', 'SUBMITTED_FOR_VERIFICATION', 'RETURNED_FOR_REWORK', 'SUBMITTED_FOR_VERIFICATION', 'VERIFIED',
        ]);

        const audit = (await api('hod').get(`/five-s/audits/${auditId}`)).body;
        expect(audit.result.totalPoints).toBe(27);
        expect(audit.result.level).toBe(2.8);
    });

    it('resolves a red tag only after a decision, and disposal needs approval', async () => {
        const tag = (await api('worker').post('/five-s/red-tags', { areaId, itemName: 'Old jig', location: 'Rack B', reason: 'OBSOLETE', raisedOn: today }).expect(201)).body;
        await api('owner').post(`/five-s/red-tags/${tag.id}/resolve`, { resolutionDetails: 'Gone', resolvedOn: today }).expect(400);
        await api('worker').post(`/five-s/red-tags/${tag.id}/decision`, { decision: 'DISPOSE' }).expect(403);
        await api('owner').post(`/five-s/red-tags/${tag.id}/decision`, { decision: 'DISPOSE' }).expect(400);
        const decided = (await api('owner').post(`/five-s/red-tags/${tag.id}/decision`, { decision: 'DISPOSE', approvalReference: 'WO-123' }).expect(201)).body;
        expect(decided).toMatchObject({ status: 'DECIDED', isPending: true });
        const resolved = (await api('owner').post(`/five-s/red-tags/${tag.id}/resolve`, { resolutionDetails: 'Scrapped via disposal form', resolvedOn: today }).expect(201)).body;
        expect(resolved).toMatchObject({ status: 'RESOLVED', isPending: false, decision: 'DISPOSE' });
    });

    it('approves standards and supersedes the previous revision', async () => {
        const created = (await api('owner').post('/five-s/standards', { areaId, title: 'Die rack layout', instructions: 'Every die has a home' }).expect(201)).body;
        await api('owner').post(`/five-s/standards/${created.id}/approve`).expect(403);
        await api('hod').post(`/five-s/standards/${created.id}/approve`).expect(201);
        const rev2 = (await api('owner').post(`/five-s/standards/${created.id}/revise`).expect(201)).body;
        expect(rev2.revision).toBe(2);
        await api('hod').post(`/five-s/standards/${rev2.id}/approve`).expect(201);
        const current = (await api('owner').get(`/five-s/standards?areaId=${areaId}&view=current`)).body;
        expect(current).toHaveLength(1);
        expect(current[0]).toMatchObject({ revision: 2, isCurrent: true });
    });

    it('records a routine check against its scheduled date', async () => {
        const routine = (await api('owner').post('/five-s/routines', {
            areaId, title: 'End-of-shift clean', checkLocation: 'Press 1', category: 'CLEANING', frequency: 'DAILY', startDate: today, responsibleId: emp('worker'),
        }).expect(201)).body;
        await api('worker').post(`/five-s/routines/${routine.id}/completions`, { scheduledDate: today, outcome: 'NOT_DONE' }).expect(400);
        const schedule = (await api('worker').post(`/five-s/routines/${routine.id}/completions`, { scheduledDate: today, outcome: 'DONE_WITH_EXCEPTION', exception: 'Air line down' }).expect(201)).body;
        expect(schedule.occurrences.find((o: { date: string }) => o.date === today).state).toBe('DONE_WITH_EXCEPTION');
        await api('worker').post(`/five-s/routines/${routine.id}/completions`, { scheduledDate: today, outcome: 'DONE' }).expect(409);
        await api('outsider').post(`/five-s/routines/${routine.id}/completions`, { scheduledDate: today, outcome: 'DONE' }).expect(404);
    });

    it('overview counts only submitted audits and labels the cross-area mean', async () => {
        await db.employee.update({ where: { id: emp('outsider') }, data: { section: 'Stores' } });
        await syncAreasFromProfiles(app.get(PrismaService), orgId, { force: true });
        await api('hod').post('/five-s/audits', { areaId, auditDate: today }).expect(201); // a draft: must not count
        const { body } = await api('mgmt').get('/five-s/overview').expect(200);
        expect(body.totals).toMatchObject({ areas: 2, assessed: 1, notAssessed: 1, targetNotMet: 1 });
        expect(body.crossAreaMean).toMatchObject({ value: 2.8, assessedAreas: 1, excludedNotAssessed: 1 });
        expect(body.crossAreaMean.label).toMatch(/equal-weight mean/i);
        expect(body.areas.find((a: { name: string }) => a.name === 'Stores').latest).toBeNull();
    });

    it('writes a change log readable by module admins only', async () => {
        await api('hod').get('/five-s/settings/change-log').expect(403);
        const log = (await api('admin').get('/five-s/settings/change-log').expect(200)).body;
        expect(log.some((e: { action: string; entityType: string }) => e.entityType === 'AUDIT' && e.action === 'SUBMITTED')).toBe(true);
    });

    it('loads and removes clearly labelled sample data', async () => {
        await api('hod').post('/five-s/settings/sample-data').expect(403);
        await api('admin').post('/five-s/settings/sample-data').expect(201);
        await api('admin').post('/five-s/settings/sample-data').expect(409);
        const areas = (await api('admin').get('/five-s/areas')).body as { name: string; isSample: boolean; latest: { level: number } | null }[];
        const samples = areas.filter((a) => a.isSample);
        expect(samples).toHaveLength(2);
        expect(samples.every((a) => a.name.startsWith('[Sample] '))).toBe(true);
        expect(samples.find((a) => a.latest)?.latest?.level).toBe(2.9);
        expect((await api('admin').delete('/five-s/settings/sample-data').expect(200)).body).toEqual({ sampleAreas: 0 });
        expect((await api('admin').get('/five-s/areas')).body.some((a: { isSample: boolean }) => a.isSample)).toBe(false);
    });
});
