import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'db';
import { EmsRegistrationService } from './ems-registration.service';
import { RegistrationLeaseLost, RegistrationRun } from './ems-registration.types';
import { Role } from 'src/common/enum/role.enum';

// Explicit disposable database only. Application DATABASE_URL is never consulted.
const url = process.env.EMS_REGISTRATION_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
jest.setTimeout(30000);
suite('registration run storage on PostgreSQL', () => {
  const schema = `ems_registration_${randomUUID().replace(/-/g,'')}`;
  let admin: PrismaClient, db: PrismaClient, service: EmsRegistrationService;
  function wrapper(client:any):any {
    return {
      $queryRaw:client.$queryRaw.bind(client), $executeRaw:client.$executeRaw.bind(client),
      $transaction: (fn:any,options:any) => db.$transaction(tx=>fn(wrapper(tx)),options),
      organization:{findUnique:async()=>({communicationChannel:'EMAIL'})},
      emsOnboardingBatch:{findFirst:async({where}:any)=>{
        const rows = await client.$queryRaw`SELECT * FROM "EmsOnboardingBatch" WHERE id = ${where.id} AND "organizationId" = ${where.organizationId}`;
        if (!rows[0]) return null;
        const records = await client.$queryRaw`SELECT * FROM "EmsOnboardingRecord" WHERE "batchId" = ${where.id} AND "organizationId" = ${where.organizationId}`;
        return {...rows[0],records};
      }},
    };
  }
  beforeAll(async()=>{
    admin = new PrismaClient({adapter:new PrismaPg({connectionString:url!,max:2})});
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    db = new PrismaClient({adapter:new PrismaPg({connectionString:url!,options:`-c search_path=${schema}`,max:8})});
    await db.$executeRawUnsafe('CREATE TABLE "Organization" (id text PRIMARY KEY)');
    await db.$executeRawUnsafe('CREATE TABLE "EmsOnboardingBatch" (id text PRIMARY KEY, "organizationId" text NOT NULL, status text NOT NULL)');
    await db.$executeRawUnsafe('CREATE TABLE "TestEmployee" (id text PRIMARY KEY)');
    await db.$executeRawUnsafe('CREATE TABLE "EmsOnboardingRecord" (id text PRIMARY KEY, "batchId" text NOT NULL, "organizationId" text NOT NULL, status text NOT NULL)');
    const migration = readFileSync(resolve(__dirname,'../../../../packages/db/prisma/migrations/20261105210000_ems_registration_runs/migration.sql'),'utf8');
    for(const statement of migration.split(';').map(s=>s.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    await db.$executeRaw`INSERT INTO "Organization" VALUES ('org')`;
    await db.$executeRaw`INSERT INTO "EmsOnboardingBatch" VALUES ('batch','org','READY')`;
    service = new EmsRegistrationService(wrapper(db),{registrationReadyIds:async()=>['row1']} as never);
    // This suite tests actual SQL locking/rollback; permission policy has separate tests.
    jest.spyOn(service as any,'actorRole').mockResolvedValue(Role.ADMIN);
  });
  afterAll(async()=>{
    if(db)await db.$disconnect();
    if(admin){try{await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.$disconnect();}}
  });
  beforeEach(async()=>{
    await db.$executeRaw`DELETE FROM "EmsRegistrationRun"`;
    await db.$executeRaw`DELETE FROM "TestEmployee"`;
    await db.$executeRaw`DELETE FROM "EmsOnboardingRecord"`;
    await db.$executeRaw`INSERT INTO "EmsOnboardingRecord" VALUES ('row1','batch','org','READY')`;
  });
  it('two concurrent starts return one run and only one worker can claim it',async()=>{
    const [a,b]=await Promise.all([service.start('org','batch','actor'),service.start('org','batch','actor')]);
    expect(a!.id).toBe(b!.id);
    const claims=await Promise.all([service.claim(),service.claim()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('recovers an expired lease and fences the previous worker',async()=>{
    await service.start('org','batch','actor');const old=(await service.claim())!;
    await db.$executeRaw`UPDATE "EmsRegistrationRun" SET "leaseUntil" = NOW() - INTERVAL '1 second'`;
    const recovered=(await service.claim())!;expect(recovered.recoveries).toBe(1);expect(recovered.leaseId).not.toBe(old.leaseId);
    await expect(db.$transaction(tx=>(service as any).authorize(wrapper(tx),old))).rejects.toBeInstanceOf(RegistrationLeaseLost);
  });
  it('rolls back employee and progress together, then commits both once',async()=>{
    await service.start('org','batch','actor');const run=(await service.claim())!;
    const write=async(tx:any,fail:boolean)=>{
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = 'org' FOR NO KEY UPDATE`;
      await (service as any).authorize(wrapper(tx),run);
      await tx.$executeRaw`INSERT INTO "TestEmployee" VALUES ('employee1')`;
      await tx.$executeRaw`UPDATE "EmsOnboardingRecord" SET status = 'REGISTERED' WHERE id = 'row1'`;
      await (service as any).checkpoint(wrapper(tx),run,'row1','registered');
      // A separate reader must see neither uncommitted employee status nor progress.
      expect(await service.status('org','batch')).toMatchObject({registered:0,batchTotals:{total:1,registered:0,excluded:0}});
      if(fail)throw new Error('Simulated process interruption before commit');
    };
    await expect(db.$transaction(tx=>write(tx,true))).rejects.toThrow('Simulated');
    expect(await db.$queryRaw`SELECT * FROM "TestEmployee"`).toEqual([]);
    let rows=await db.$queryRaw<RegistrationRun[]>`SELECT * FROM "EmsRegistrationRun"`;expect(rows[0].registered).toBe(0);
    await db.$transaction(tx=>write(tx,false));
    expect(await service.status('org','batch')).toMatchObject({registered:1,batchTotals:{total:1,registered:1,excluded:0}});
    rows=await db.$queryRaw<RegistrationRun[]>`SELECT * FROM "EmsRegistrationRun"`;expect(rows[0].registered).toBe(1);expect(rows[0].completedIds).toEqual(['row1']);
    await expect(db.$transaction(tx=>(service as any).checkpoint(wrapper(tx),run,'row1','registered'))).rejects.toBeInstanceOf(RegistrationLeaseLost);
    rows=await db.$queryRaw<RegistrationRun[]>`SELECT * FROM "EmsRegistrationRun"`;expect(rows[0].registered).toBe(1);
  });
  it('pause fences the current run and a later start has a different run identity',async()=>{
    await service.start('org','batch','actor');const old=(await service.claim())!;
    expect(await service.stop('org','batch','actor')).toMatchObject({status:'STOPPED'});
    await expect(db.$transaction(tx=>(service as any).authorize(wrapper(tx),old))).rejects.toBeInstanceOf(RegistrationLeaseLost);
    expect((await service.start('org','batch','actor'))!.id).not.toBe(old.id);
  });
  it('keeps whole-import counts across pause/resume and scopes totals to company and batch',async()=>{
    await db.$executeRaw`INSERT INTO "EmsOnboardingRecord" VALUES
      ('done','batch','org','REGISTERED'), ('excluded','batch','org','EXCLUDED'),
      ('review','batch','org','NEEDS_FIXING'), ('other-company','batch','other','REGISTERED'),
      ('other-import','another','org','REGISTERED')`;
    const expected={total:4,registered:1,excluded:1};
    const first=await service.start('org','batch','actor');
    expect(first).toMatchObject({registered:0,batchTotals:expected});
    expect(await service.stop('org','batch','actor')).toMatchObject({batchTotals:expected});
    const next=await service.start('org','batch','actor');
    expect(next!.id).not.toBe(first!.id);
    expect(next).toMatchObject({registered:0,batchTotals:expected});
    expect(await service.status('org','batch')).toMatchObject({batchTotals:expected});
  });
  it('cannot return or stop another company run',async()=>{
    await service.start('org','batch','actor');
    await expect(service.status('other','batch')).rejects.toThrow('not found');
    await expect(service.stop('other','batch','actor')).rejects.toThrow('not found');
    expect(await service.status('org','batch')).toMatchObject({status:'QUEUED'});
  });
});
