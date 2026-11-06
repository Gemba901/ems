import { ForbiddenException, Logger } from '@nestjs/common';
import { EmsRegistrationService } from './ems-registration.service';
import { publicRegistrationRun, registrationErrorCode, RegistrationLeaseLost, RegistrationRun } from './ems-registration.types';
import { Role } from 'src/common/enum/role.enum';
const run = (): RegistrationRun => ({id:'run',batchId:'batch',organizationId:'org',actorId:'actor',communicationChannel:'EMAIL',status:'RUNNING',
  recordIds:['a','b'],completedIds:['a'],registered:1,failed:0,awaitingAdmin:0,skipped:0,leaseId:'lease',leaseUntil:new Date(Date.now()+90000),
  recoveries:0,message:null,createdAt:new Date(),updatedAt:new Date()});
function setup() {
  const db:any = {
    organization:{findUnique:jest.fn().mockResolvedValue({communicationChannel:'EMAIL'})},
    userOrganization:{findUnique:jest.fn().mockResolvedValue({role:{name:Role.ADMIN},organization:{status:'ACTIVE',modules:['EMS'],isAdminOrg:false}})},
    emsOnboardingBatch:{findFirst:jest.fn().mockResolvedValue({id:'batch',status:'READY',records:[{id:'b',status:'READY',beesAccessLevel:'Employee'},{id:'done',status:'REGISTERED'},{id:'excluded',status:'EXCLUDED'}]})},
    $queryRaw:jest.fn().mockResolvedValue([]),$executeRaw:jest.fn().mockResolvedValue(1),$transaction:jest.fn(),
  };
  db.$transaction.mockImplementation((fn:any)=>fn(db));
  const ems:any = {registrationReadyIds:jest.fn().mockResolvedValue(['b']),registerOnboardingRecords:jest.fn().mockResolvedValue({registered:1,failed:0})};
  const service = new EmsRegistrationService(db,ems);
  return {db,ems,service};
}
describe('durable registration coordinator',()=>{
  beforeEach(()=>{ jest.spyOn(Logger.prototype,'log').mockImplementation(()=>{}); jest.spyOn(Logger.prototype,'error').mockImplementation(()=>{}); });
  afterEach(()=>jest.restoreAllMocks());
  it('returns an already active run on repeated starts', async()=>{
    const {db,service}=setup(); db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([run()]);
    expect(await service.start('org','batch','actor')).toMatchObject({id:'run',processed:1,total:2,batchTotals:{total:3,registered:1,excluded:1}});
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('returns whole-import totals separately from the latest run and excludes private fields',async()=>{
    const {db,service}=setup();
    db.$queryRaw.mockResolvedValue([{...run(),batchTotals:{total:550,registered:144,excluded:24}}]);
    const result=await service.status('org','batch');
    expect(result).toMatchObject({registered:1,batchTotals:{total:550,registered:144,excluded:24}});
    expect(result).not.toHaveProperty('recordIds');
    expect(db.emsOnboardingBatch.findFirst).toHaveBeenCalledWith({where:{id:'batch',organizationId:'org'},select:{id:true}});
  });
  it('a batch with no run still returns null and does not start one',async()=>{
    const {db,service,ems}=setup();
    expect(await service.status('org','batch')).toBeNull();
    expect(db.$executeRaw).not.toHaveBeenCalled();expect(ems.registrationReadyIds).not.toHaveBeenCalled();
  });
  it('rejects a new start after permissions were revoked',async()=>{
    const {db,service}=setup();db.userOrganization.findUnique.mockResolvedValue(null);
    await expect(service.start('org','batch','actor')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.emsOnboardingBatch.findFirst).not.toHaveBeenCalled();
  });
  it('rechecks company suspension and EMS enablement',async()=>{
    for (const organization of [{status:'SUSPENDED',modules:['EMS']},{status:'ACTIVE',modules:[]}]) {
      const {db,service}=setup();db.userOrganization.findUnique.mockResolvedValue({role:{name:Role.ADMIN},organization});
      await expect(service.start('org','batch','actor')).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
  it('resumes only unfinished targets and delegates fenced transactional callbacks',async()=>{
    const {ems,service}=setup();jest.spyOn(service,'claim').mockResolvedValue(run());
    await service.tick();
    expect(ems.registerOnboardingRecords).toHaveBeenCalledWith('org','batch',Role.ADMIN,expect.objectContaining({recordIds:['b'],authorize:expect.any(Function),checkpoint:expect.any(Function)}));
  });
  it('limits a claim to 20 remaining records and queues unfinished work automatically',async()=>{
    const {db,ems,service}=setup();const job={...run(),recordIds:Array.from({length:45},(_,i)=>`r${i}`),completedIds:[],registered:0};
    jest.spyOn(service,'claim').mockResolvedValue(job);
    db.$queryRaw.mockResolvedValue([{...job,completedIds:job.recordIds.slice(0,20),registered:20}]);
    await service.tick();
    expect(ems.registerOnboardingRecords.mock.calls[0][3].recordIds).toHaveLength(20);
    expect(String(db.$executeRaw.mock.calls[0][0][0])).toContain("status = 'QUEUED'");
  });
  it('stops when the communication channel changes between groups',async()=>{
    const {db,service}=setup();db.$queryRaw.mockResolvedValue([{id:'run'}]);
    db.organization.findUnique.mockResolvedValue({communicationChannel:'WHATSAPP'});
    await expect((service as any).authorize(db,run())).rejects.toThrow('communication channel changed');
  });
  it('rechecks the initiating user when a recovered worker starts another employee',async()=>{
    const {db,service}=setup();db.$queryRaw.mockResolvedValue([{id:'run'}]);
    db.userOrganization.findUnique.mockResolvedValue(null);
    await expect((service as any).authorize(db,run())).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not start two workers in the same process',async()=>{
    const {ems,service}=setup();const claim=jest.spyOn(service,'claim').mockResolvedValue(run());
    let release!:()=>void;ems.registerOnboardingRecords.mockImplementation(()=>new Promise<void>(r=>release=r));
    const first=service.tick();for(let i=0;i<10&&!release;i++)await Promise.resolve();
    await service.tick();expect(claim).toHaveBeenCalledTimes(1);release();await first;
  });
  it('stops after repeated crashed-worker recoveries',async()=>{
    const {ems,service}=setup();jest.spyOn(service,'claim').mockResolvedValue({...run(),recoveries:4});
    await service.tick();expect(ems.registerOnboardingRecords).not.toHaveBeenCalled();
  });
  it('never changes employee validation on lost ownership',async()=>{
    const {db,ems,service}=setup();jest.spyOn(service,'claim').mockResolvedValue(run());
    ems.registerOnboardingRecords.mockRejectedValue(new RegistrationLeaseLost());await service.tick();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('logs classification and IDs without leaking error messages or SQL',async()=>{
    const {ems,service}=setup();jest.spyOn(service,'claim').mockResolvedValue(run());
    ems.registerOnboardingRecords.mockRejectedValue(Object.assign(new Error('secret@email.invalid password=secret'),{code:'P2028'}));
    await service.tick();
    expect(Logger.prototype.error).toHaveBeenCalledWith({event:'registration_run_failed',runId:'run',batchId:'batch',code:'P2028'});
    expect(JSON.stringify((Logger.prototype.error as jest.Mock).mock.calls)).not.toContain('secret');
  });
  it('does not expose actor, target record IDs, lease or tenant internals in progress',()=>{
    const result=publicRegistrationRun(run());expect(result).toMatchObject({registered:1,total:2});
    for(const key of ['actorId','organizationId','recordIds','completedIds','leaseId','leaseUntil'])expect(result).not.toHaveProperty(key);
    expect(registrationErrorCode({code:'secret@email.invalid'})).toBe('UnknownError');
  });
});
