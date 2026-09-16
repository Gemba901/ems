import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'db';
import { randomBytes, randomUUID } from 'node:crypto';
import { OnboardingService } from './onboarding.service';
import { OnboardingWorker } from './onboarding.worker';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/channels/email.service';
import * as bcrypt from 'bcrypt';

jest.setTimeout(30_000);
const url = process.env.MILESTONE5_TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Verified onboarding on disposable PostgreSQL',
  () => {
    let db: PrismaClient;
    let service: OnboardingService;
    const config = new ConfigService({
      ONBOARDING_TOKEN_SECRET: 'test'.repeat(16),
      ONBOARDING_ORIGIN: 'http://localhost:3000',
      TENANT_BASE_DOMAIN: 'localhost',
      ONBOARDING_WORKER_ENABLED: 'true',
    });
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    let worker: OnboardingWorker;
    const signup = () => ({
      requestKey: randomBytes(32).toString('hex'),
      slug: `test-${randomUUID().slice(0, 8)}`,
      companyName: `Test ${randomUUID()}`,
      firstName: 'First',
      lastName: 'Last',
      email: `${randomUUID()}@example.test`,
      phone: `254${Math.floor(100000000 + Math.random() * 900000000)}`,
      timeZone: 'Africa/Nairobi',
    });
    beforeAll(async () => {
      const target = new URL(url!);
      if (
        target.hostname !== '127.0.0.1' ||
        target.port !== '55440' ||
        target.pathname !== '/onboarding_test'
      )
        throw new Error('Only the disposable onboarding database is permitted');
      db = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url! }),
      });
      await db.$connect();
      await db.role.upsert({
        where: { name: 'ADMIN' },
        create: { id: 2, name: 'ADMIN' },
        update: {},
      });
      service = new OnboardingService(db as PrismaService, config);
      worker = new OnboardingWorker(
        db as PrismaService,
        config,
        service,
        email as unknown as EmailService,
      );
    });
    beforeEach(async () => {
      email.send.mockReset().mockResolvedValue(undefined);
      // This database is exclusively owned by this test suite.
      await db.onboardingMessage.deleteMany();
      await db.onboardingRequest.deleteMany();
      await db.employee.deleteMany();
      await db.userOrganization.deleteMany();
      await db.user.deleteMany();
      await db.organization.deleteMany();
    });
    afterAll(async () => {
      if (db) await db.$disconnect();
    });

    it('reserves a normalized slug without creating identity, stores no raw verification token and queues mail', async () => {
      const dto = signup();
      dto.slug = ' ACME ';
      const result = await service.signup(dto);
      const request = await db.onboardingRequest.findUniqueOrThrow({
        where: { id: result.id },
      });
      expect(request.slug).toBe('acme');
      expect(request.verificationHash).not.toBe(
        service.token(result.id, 'verify'),
      );
      expect(request.passwordHash).toBeNull();
      expect(await db.organization.count()).toBe(0);
      expect(await db.user.count()).toBe(0);
      await worker.deliverOne();
      expect(email.send).toHaveBeenCalledWith(
        expect.objectContaining({
          actionUrl: expect.stringContaining('/signup/verify#id='),
        }),
        { requireDelivery: true },
      );
      expect(
        (await db.onboardingMessage.findFirstOrThrow()).sentAt,
      ).not.toBeNull();
    });
    it('concurrent retries with one key return one reservation and one email', async () => {
      const dto = signup();
      const results = await Promise.all([
        service.signup(dto),
        service.signup(dto),
      ]);
      expect(results[0].id).toBe(results[1].id);
      expect(await db.onboardingMessage.count()).toBe(1);
      await expect(
        service.signup({ ...dto, firstName: 'Changed' }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it('only one concurrent signup can reserve a slug', async () => {
      const dto = signup();
      const results = await Promise.allSettled([
        service.signup(dto),
        service.signup({ ...signup(), slug: dto.slug }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.onboardingRequest.count()).toBe(1);
    });
    it('rejects forged, expired and mismatched progress capabilities', async () => {
      const { id } = await service.signup(signup());
      await expect(
        service.verify({
          id,
          token: 'a'.repeat(64),
          password: 'safe-password-123',
        }),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        service.status({ id, token: 'b'.repeat(64) }),
      ).rejects.toMatchObject({ status: 404 });
      await db.onboardingRequest.update({
        where: { id },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        service.verify({
          id,
          token: service.token(id, 'verify'),
          password: 'safe-password-123',
        }),
      ).rejects.toMatchObject({ status: 401 });
    });
    it('verification and two workers provision exactly one company with ADMIN and no platform membership', async () => {
      const dto = signup();
      const { id } = await service.signup(dto);
      const verify = {
        id,
        token: service.token(id, 'verify'),
        password: 'safe-password-123',
      };
      const result = await service.verify(verify);
      const repeated = await service.verify({
        ...verify,
        password: 'different-password',
      });
      expect(repeated.progressToken).toBe(result.progressToken);
      await Promise.all([service.provisionOne(), service.provisionOne()]);
      await service.provisionOne();
      expect(await db.organization.count()).toBe(1);
      expect(await db.employee.count()).toBe(1);
      const user = await db.user.findFirstOrThrow();
      expect(await bcrypt.compare(verify.password, user.password!)).toBe(true);
      const membership = await db.userOrganization.findFirstOrThrow({
        include: { role: true, organization: true },
      });
      expect(membership.role.name).toBe('ADMIN');
      expect(membership.organization.isAdminOrg).toBe(false);
      const ready = await service.status({ id, token: result.progressToken });
      expect(ready.status).toBe('READY');
      expect(ready.workspaceUrl).toContain(`${dto.slug}.localhost:3000/login`);
      expect(
        (await db.onboardingRequest.findUniqueOrThrow({ where: { id } }))
          .passwordHash,
      ).toBeNull();
      expect(
        await db.onboardingMessage.count({ where: { kind: 'WELCOME' } }),
      ).toBe(1);
    });
    it('requires an existing account password and preserves identity when adding membership', async () => {
      const dto = signup();
      const existing = await db.user.create({
        data: {
          name: 'Original',
          email: dto.email,
          phone: dto.phone,
          password: await bcrypt.hash('oldpass', 4),
        },
      });
      const { id } = await service.signup(dto);
      const token = service.token(id, 'verify');
      await expect(
        service.verify({ id, token, password: 'wrong-password' }),
      ).rejects.toMatchObject({ status: 401 });
      await service.verify({ id, token, password: 'oldpass' });
      await service.provisionOne();
      expect(await db.user.count()).toBe(1);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: existing.id } })).name,
      ).toBe('Original');
    });
    it('rolls back every provisioning write when employee insertion fails, then retries successfully', async () => {
      const { id } = await service.signup(signup());
      await service.verify({
        id,
        token: service.token(id, 'verify'),
        password: 'safe-password-123',
      });
      await db.$executeRawUnsafe(
        `CREATE FUNCTION reject_test_employee() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER reject_test_employee BEFORE INSERT ON "Employee" FOR EACH ROW EXECUTE FUNCTION reject_test_employee()`,
      );
      try {
        await service.provisionOne();
        expect(await db.organization.count()).toBe(0);
        expect(await db.user.count()).toBe(0);
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER reject_test_employee ON "Employee"',
        );
        await db.$executeRawUnsafe('DROP FUNCTION reject_test_employee()');
      }
      await db.onboardingRequest.update({
        where: { id },
        data: { nextAttemptAt: new Date(0) },
      });
      await service.provisionOne();
      expect(await db.organization.count()).toBe(1);
    });
    it('email failure persists a retry and two workers do not claim the same message', async () => {
      await service.signup(signup());
      email.send.mockRejectedValue(new Error('mail unavailable'));
      await Promise.all([worker.deliverOne(), worker.deliverOne()]);
      expect(email.send).toHaveBeenCalledTimes(1);
      const job = await db.onboardingMessage.findFirstOrThrow();
      expect(job.sentAt).toBeNull();
      expect(job.availableAt.getTime()).toBeGreaterThan(Date.now());
      email.send.mockResolvedValue(undefined);
      await db.onboardingMessage.update({
        where: { id: job.id },
        data: { availableAt: new Date(0) },
      });
      await worker.deliverOne();
      expect(
        (await db.onboardingMessage.findFirstOrThrow()).sentAt,
      ).not.toBeNull();
    });
    it('expires abandoned reservations and prevents public callers from retrying unverified provisioning', async () => {
      const dto = signup();
      const { id } = await service.signup(dto);
      await expect(
        service.retry({ id, token: dto.requestKey }),
      ).rejects.toMatchObject({ status: 409 });
      await db.onboardingRequest.update({
        where: { id },
        data: { expiresAt: new Date(0) },
      });
      await service.signup({ ...signup(), slug: dto.slug });
      expect(
        (await db.onboardingRequest.findUniqueOrThrow({ where: { id } }))
          .status,
      ).toBe('EXPIRED');
    });
    it('verified owners can retry an exhausted transient failure but strangers cannot', async () => {
      const { id } = await service.signup(signup());
      const verified = await service.verify({
        id,
        token: service.token(id, 'verify'),
        password: 'safe-password-123',
      });
      await db.onboardingRequest.update({
        where: { id },
        data: {
          status: 'FAILED',
          failureCode: 'PROVISIONING_FAILED',
          attempts: 5,
          updatedAt: new Date(0),
        },
      });
      await expect(
        service.retry({ id, token: 'f'.repeat(64) }),
      ).rejects.toMatchObject({ status: 404 });
      await service.retry({ id, token: verified.progressToken });
      await service.provisionOne();
      expect(
        (await service.status({ id, token: verified.progressToken })).status,
      ).toBe('READY');
    });

    it('recovers an abandoned email lease without claiming an active lease', async () => {
      await service.signup(signup());
      const job = await db.onboardingMessage.findFirstOrThrow();
      await db.onboardingMessage.update({
        where: { id: job.id },
        data: {
          leaseId: 'crashed-worker',
          leaseUntil: new Date(Date.now() + 60000),
        },
      });
      await worker.deliverOne();
      expect(email.send).not.toHaveBeenCalled();
      await db.onboardingMessage.update({
        where: { id: job.id },
        data: { leaseUntil: new Date(0) },
      });
      await worker.deliverOne();
      expect(email.send).toHaveBeenCalledTimes(1);
      expect(
        (await db.onboardingMessage.findFirstOrThrow()).leaseId,
      ).toBeNull();
    });
  },
);
