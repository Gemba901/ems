import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, RoleName } from 'db';
import { randomUUID, createHash } from 'node:crypto';
import type { Cache } from 'cache-manager';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/channels/email.service';

// Explicit opt-in: never fall back to the application DATABASE_URL.
const url = process.env.MILESTONE3_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('Company refresh on PostgreSQL', () => {
  let db: PrismaClient;
  const orgId = randomUUID();
  const userId = randomUUID();
  const tenant = { organizationId: orgId, slug: `test-${randomUUID().slice(0, 8)}`, name: 'Refresh integration test' };
  const hash = (raw: string) => createHash('sha256').update(raw).digest('hex');

  beforeAll(async () => {
    const target = new URL(url!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55439') {
      throw new Error('Use the disposable local test database on port 55439');
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await db.$connect();
    const role = await db.role.upsert({ where: { name: RoleName.ADMIN }, update: {}, create: { id: 2, name: RoleName.ADMIN } });
    await db.organization.create({ data: { id: orgId, name: tenant.name, slug: tenant.slug } });
    await db.user.create({ data: { id: userId, name: 'Test', phone: `test-${userId}`, email: null } });
    await db.userOrganization.create({ data: { userId, organizationId: orgId, roleId: role.id } });
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.refreshToken.deleteMany({ where: { userId } });
    await db.userOrganization.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.organization.deleteMany({ where: { id: orgId } });
    await db.$disconnect();
  });
  beforeEach(async () => { await db.refreshToken.deleteMany({ where: { userId } }); });

  async function seed() {
    const raw = randomUUID();
    await db.refreshToken.create({ data: { userId, organizationId: orgId, tokenHash: hash(raw), expiresAt: new Date(Date.now() + 60_000) } });
    return raw;
  }

  function service(client: unknown = db) {
    return new AuthService(client as PrismaService, new JwtService({ secret: 'postgres-integration-test', signOptions: { expiresIn: '7d' } }), new ConfigService(), {} as EmailService, {} as Cache);
  }

  it('persists a replacement and rejects replay of the old token', async () => {
    const raw = await seed();
    const auth = service();
    const result = await auth.refreshForTenant(tenant, raw);
    expect(await db.refreshToken.findUnique({ where: { tokenHash: hash(raw) } })).toBeNull();
    expect(await db.refreshToken.findUnique({ where: { tokenHash: hash(result.refreshToken) } })).toMatchObject({ userId, organizationId: orgId });
    await expect(auth.refreshForTenant(tenant, raw)).rejects.toMatchObject({ status: 401 });
  });

  it('preserves the token after a wrong-company request', async () => {
    const raw = await seed();
    await expect(service().refreshForTenant({ ...tenant, organizationId: randomUUID() }, raw)).rejects.toMatchObject({ status: 401 });
    expect(await db.refreshToken.count({ where: { tokenHash: hash(raw) } })).toBe(1);
  });

  it('rolls back the actual deletion when replacement insertion fails', async () => {
    const raw = await seed();
    const failure = new Error('Injected replacement failure');
    const client = {
      $transaction: (callback: (tx: unknown) => unknown, options: object) => db.$transaction(async (tx) => {
        // Only inject the failure; deletion, rollback and persistence use PostgreSQL.
        const wrapped = new Proxy(tx, { get(target, key) {
          if (key === 'refreshToken') return new Proxy(target.refreshToken, { get(delegate, operation) {
            return operation === 'create' ? async () => { throw failure; } : Reflect.get(delegate, operation);
          } });
          return Reflect.get(target, key);
        } });
        return callback(wrapped);
      }, options),
    };
    await expect(service(client).refreshForTenant(tenant, raw)).rejects.toBe(failure);
    expect(await db.refreshToken.count({ where: { userId } })).toBe(1);
    expect(await db.refreshToken.findUnique({ where: { tokenHash: hash(raw) } })).not.toBeNull();
  });

  it('allows exactly one replacement when two transactions read the same token', async () => {
    const raw = await seed();
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>(resolve => { release = resolve; });
    const client = {
      $transaction: (callback: (tx: unknown) => unknown, options: object) => db.$transaction(async (tx) => {
        const wrapped = new Proxy(tx, { get(target, key) {
          if (key === 'refreshToken') return new Proxy(target.refreshToken, { get(delegate, operation) {
            if (operation !== 'findUnique') return Reflect.get(delegate, operation);
            return async (args: Parameters<typeof delegate.findUnique>[0]) => {
              const row = await delegate.findUnique(args);
              if (++reads === 2) release();
              await bothRead;
              return row;
            };
          } });
          return Reflect.get(target, key);
        } });
        return callback(wrapped);
      }, options),
    };
    const auth = service(client);
    const results = await Promise.allSettled([auth.refreshForTenant(tenant, raw), auth.refreshForTenant(tenant, raw)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await db.refreshToken.count({ where: { userId } })).toBe(1);
    expect(await db.refreshToken.findUnique({ where: { tokenHash: hash(raw) } })).toBeNull();
  }, 15_000);
});
