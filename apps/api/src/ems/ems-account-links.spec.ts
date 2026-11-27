import { EmsAccountLinksService, createPendingAccountLink, accountLinkHash } from './ems-account-links';
import { EmsInvitationsService } from './ems-invitations';
import * as bcrypt from 'bcrypt';

const token = 'a'.repeat(43);
function fixture(extra: any = {}) {
  let row: any = {
    employeeId: 'a-employee', organizationId: 'a', userId: 'login-b', roleId: 1,
    requestedPhone: '254712345678', importedEmail: 'a-import@example.test',
    sourceKind: 'EMPLOYEE_EMAIL', sourceEmployeeId: 'b-employee', destination: 'b-original@example.test',
    status: 'SENT', tokenHash: accountLinkHash(token), expiresAt: new Date(Date.now() + 100000), verifiedAt: null,
    user: { id: 'login-b', phone: '254712345678', email: null, password: null },
    employee: { id: 'a-employee', organizationId: 'a', userId: null, phone: '254712345678', email: 'a-import@example.test',
      firstName: 'Jane', lastName: 'Test', employeeCode: 'A1', employmentStatus: 'ACTIVE', beesAccessLevel: 'Employee' },
    organization: { name: 'Company A', status: 'ACTIVE' }, role: { name: 'EMPLOYEE' }, ...extra,
  };
  let sourceEmail = 'b-original@example.test';
  const db: any = {
    emsAccountLink: {
      create: jest.fn(async ({data}) => data),
      findUnique: jest.fn(async ({where}) => where.tokenHash && where.tokenHash !== row.tokenHash ? null : structuredClone(row)),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async ({data}) => { row = { ...row, ...data }; return structuredClone(row); }),
      updateMany: jest.fn(async ({where, data}) => {
        if (where.tokenHash && where.tokenHash !== row.tokenHash || where.status && typeof where.status === 'string' && where.status !== row.status) return {count: 0};
        row = { ...row, ...data }; return {count: 1};
      }),
    },
    employee: {
      findFirst: jest.fn(async ({where}) => where.id === 'b-employee' ? {id: 'b-employee', email: sourceEmail, employmentStatus: 'ACTIVE'} : null),
      updateMany: jest.fn(async ({data}) => { row.employee = {...row.employee,...data}; return {count: 1}; }),
    },
    user: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async ({data}) => { row.user = {...row.user,...data}; return {count: 1}; }) },
    userOrganization: { upsert: jest.fn(async () => ({})) },
    emsInvitation: { create: jest.fn(async ({data}) => data), update: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (fn) => { const before = structuredClone(row); try { return await fn(db); } catch(e) { row=before; throw e; } }),
  };
  const email = {send: jest.fn(async (_payload: any, _options?: any) => undefined)};
  const service = new EmsAccountLinksService(db, email as any);
  return {db,email,service,get row(){return row;}, setRow: (data:any) => {row={...row,...data};}, changeSource: (value:string) => {sourceEmail=value;} };
}

describe('existing-account verification and consent', () => {
  it('registration preserves the employee and records a pending candidate without treating contact equality as consent', async () => {
    const {db} = fixture();
    await createPendingAccountLink(db,'a','a-employee',{id:'login-b',phone:'254712345678',email:'b@example.test'},'254712345678','b@example.test',1);
    expect(db.emsAccountLink.create).toHaveBeenCalledWith({data: expect.objectContaining({userId:'login-b',destination:'b@example.test',contactMatches:true})});
    expect(db.userOrganization.upsert).not.toHaveBeenCalled();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('sends only to the existing source, hides the token/address from HR, and keeps membership pending', async () => {
    const f=fixture({status:'PENDING',tokenHash:null,expiresAt:null});
    expect(await f.service.send('a','a-employee','hr','https://a.example.test',false)).toEqual({category:'ACCOUNT_LINK'});
    const payload:any=f.email.send.mock.calls[0][0];
    expect(payload.to).toBe('b-original@example.test');
    expect(payload.actionUrl).toMatch(/\/invite#account-link=/);
    expect(f.db.emsInvitation.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({destination:null,tokenHash:null,userId:null})}));
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
    expect(f.row.contactMatches).toBe(false);
  });

  it('a verified email does not grant membership until explicit acceptance', async () => {
    const f=fixture();
    expect(await f.service.verify('a',token)).toMatchObject({valid:true,verified:true});
    expect(f.row.verificationMethod).toBe('DIRECT_EMAIL_LINK');
    expect(f.row.destination).toBe('b-original@example.test');
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
    await expect(f.service.accept('a',token,false,'Abcdefghij12')).rejects.toThrow('Explicit acceptance');
  });

  it('creates a password only after direct verification and consent, then links the employee atomically', async () => {
    const f=fixture();
    await f.service.verify('a',token);
    await expect(f.service.accept('a',token,true,'Abcdefghij12')).resolves.toEqual({accepted:true});
    expect(await bcrypt.compare('Abcdefghij12', f.row.user.password)).toBe(true);
    expect(f.row.status).toBe('ACCEPTED'); expect(f.row.tokenHash).toBeNull();
    expect(f.row.employee.userId).toBe('login-b');
    expect(f.db.userOrganization.upsert).toHaveBeenCalledWith({where:{userId_organizationId:{userId:'login-b',organizationId:'a'}},update:{},create:{userId:'login-b',organizationId:'a',roleId:1}});
    await expect(f.service.accept('a',token,true,'Abcdefghij12')).rejects.toThrow();
  });

  it('requires the current password for an established account and never replaces it', async () => {
    const f=fixture(); const hash=await bcrypt.hash('ExistingPass123',4);
    f.setRow({user:{...f.row.user,password:hash},verifiedAt:new Date(),status:'VERIFIED'});
    await expect(f.service.accept('a',token,true,'wrong')).rejects.toThrow('Password could not');
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
    await f.service.accept('a',token,true,'ExistingPass123');
    expect(f.db.user.updateMany).not.toHaveBeenCalled();expect(f.row.user.password).toBe(hash);
  });

  it.each(['CANCELLED','DECLINED','ACCEPTED','FAILED'])('rejects terminal %s links', async status => {
    const f=fixture({status});
    expect(await f.service.lookup('a',token)).toMatchObject({valid:false});
    await expect(f.service.verify('a',token)).rejects.toThrow();
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
  });

  it('rejects other-company requests, expired tokens, changed contacts and inactive employees', async () => {
    const f=fixture();
    expect(await f.service.lookup('other',token)).toMatchObject({valid:false});
    f.setRow({expiresAt:new Date(0)});expect(await f.service.lookup('a',token)).toMatchObject({valid:false});
    f.setRow({expiresAt:new Date(Date.now()+100000)});f.changeSource('changed@example.test');
    expect(await f.service.lookup('a',token)).toMatchObject({valid:false});
    f.changeSource('b-original@example.test');f.setRow({employee:{...f.row.employee,employmentStatus:'TERMINATED'}});
    expect(await f.service.lookup('a',token)).toMatchObject({valid:false});
  });

  it('holds requests without an existing usable contact and refuses shared mailboxes', async () => {
    const f=fixture({sourceKind:null,status:'PENDING'});
    expect(await f.service.preview('a','a-employee',true)).toMatchObject({category:'SKIPPED'});
    f.setRow({sourceKind:'EMPLOYEE_EMAIL'});
    f.db.employee.findFirst.mockImplementation(async ({where}) => where.id==='b-employee' ? {email:'b-original@example.test',employmentStatus:'ACTIVE'} : {id:'someone-else'});
    expect(await f.service.preview('a','a-employee',true)).toMatchObject({category:'SKIPPED'});
    expect(f.email.send).not.toHaveBeenCalled();
  });

  it('decline invalidates the token and grants nothing; HR cannot resend a declined request', async () => {
    const f=fixture(); await f.service.decline('a',token);
    expect(f.row.status).toBe('DECLINED');expect(f.row.tokenHash).toBeNull();
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
    expect(await f.service.preview('a','a-employee',true)).toMatchObject({category:'SKIPPED'});
  });

  it('delivery failure revokes the generated token without granting access', async () => {
    const f=fixture({status:'PENDING',tokenHash:null,expiresAt:null});f.email.send.mockRejectedValueOnce(new Error('provider failure'));
    expect(await f.service.send('a','a-employee','hr','https://a.example.test',false)).toMatchObject({failed:true});
    expect(f.row.status).toBe('FAILED');expect(f.row.tokenHash).toBeNull();
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
  });

  it('resend invalidates the old token and resets verification', async () => {
    const f=fixture({status:'VERIFIED',verifiedAt:new Date()});
    await f.service.send('a','a-employee','hr','https://a.example.test',true);
    expect(f.row.verifiedAt).toBeNull();
    expect(await f.service.lookup('a',token)).toMatchObject({valid:false});
  });

  it('changed role, phone or account linkage blocks stale acceptance', async () => {
    for (const change of [{beesAccessLevel:'Admin'},{phone:'254711222333'},{userId:'different-user'}]) {
      const f=fixture({status:'VERIFIED',verifiedAt:new Date()});f.setRow({employee:{...f.row.employee,...change}});
      await expect(f.service.accept('a',token,true,'Abcdefghij12')).rejects.toThrow();
      expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
    }
  });

  it('checks again inside the transaction rather than trusting a pre-hash snapshot', async () => {
    const f=fixture({status:'VERIFIED',verifiedAt:new Date()});
    f.db.$transaction.mockImplementationOnce(async fn => {f.setRow({status:'CANCELLED'});return fn(f.db);});
    await expect(f.service.accept('a',token,true,'Abcdefghij12')).rejects.toThrow();
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
  });
  it('acceptance requires verification even when consent and password are supplied', async () => {
    const f=fixture();
    await expect(f.service.accept('a',token,true,'Abcdefghij12')).rejects.toThrow('Verify your existing email first');
    expect(f.db.user.updateMany).not.toHaveBeenCalled();
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
  });

  it('HR cancellation revokes the separate account token as well as the invitation', async () => {
    const f=fixture();
    f.db.emsInvitation.updateMany=jest.fn(async()=>({count:1}));
    f.db.emsInvitation.findFirst=jest.fn(async()=>({status:'CANCELLED'}));
    f.db.employee.findFirst.mockResolvedValue({id:'a-employee'});
    await new EmsInvitationsService(f.db).cancel('a','a-employee');
    expect(f.row.status).toBe('CANCELLED'); expect(f.row.tokenHash).toBeNull();
    expect(await f.service.lookup('a',token)).toMatchObject({valid:false});
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
  });

  it('rolls back password creation if linking the employee loses a concurrent change', async () => {
    const f=fixture({status:'VERIFIED',verifiedAt:new Date()});
    f.db.employee.updateMany.mockResolvedValueOnce({count:0});
    await expect(f.service.accept('a',token,true,'Abcdefghij12')).rejects.toThrow();
    expect(f.row.user.password).toBeNull();
    expect(f.row.employee.userId).toBeNull();
    expect(f.row.tokenHash).toBe(accountLinkHash(token));
    expect(f.db.userOrganization.upsert).not.toHaveBeenCalled();
  });

});
