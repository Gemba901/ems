import { onboardingReadContext } from './onboarding-read-context';
import { onboardingPerformance } from './onboarding-performance';
import { Logger } from '@nestjs/common';

function database() {
  return {
    employee: {findMany:jest.fn(async ({where}:any)=>[{id:`employee-${where.organizationId}`}])},
    department: {findMany:jest.fn(async ({where}:any)=>[{id:where.organizationId,name:'Production'}])},
  };
}

describe('transaction-local onboarding snapshots', () => {
  it('is lazy and deduplicates simultaneous reads in one phase', async () => {
    const db=database(), context=onboardingReadContext(db as any,'org');
    expect(db.employee.findMany).not.toHaveBeenCalled();
    const [a,b]=await Promise.all([context.employees(),context.employees()]);
    expect(a).toBe(b); expect(db.employee.findMany).toHaveBeenCalledTimes(1);
    await Promise.all([context.departments(),context.departments()]);
    expect(db.department.findMany).toHaveBeenCalledTimes(1);
  });
  it('does not share results across organisations', async () => {
    const db=database();
    const a=onboardingReadContext(db as any,'a'), b=onboardingReadContext(db as any,'b');
    expect(await a.employees()).not.toEqual(await b.employees());
    expect(db.employee.findMany.mock.calls.map(([args])=>args.where)).toEqual([{organizationId:'a'},{organizationId:'b'}]);
  });
  it('does not share results across transactions or retry phases', async () => {
    const db=database();
    await onboardingReadContext(db as any,'org').employees();
    db.employee.findMany.mockResolvedValue([{id:'new-employee'}]);
    expect(await onboardingReadContext(db as any,'org').employees()).toEqual([{id:'new-employee'}]);
    expect(db.employee.findMany).toHaveBeenCalledTimes(2);
  });
  it('propagates a failed read and leaves the next phase free to retry freshly', async () => {
    const db=database(), error=new Error('read failed');
    db.employee.findMany.mockRejectedValueOnce(error);
    await expect(onboardingReadContext(db as any,'org').employees()).rejects.toBe(error);
    await expect(onboardingReadContext(db as any,'org').employees()).resolves.toEqual([{id:'employee-org'}]);
  });
});

describe('development phase timings', () => {
  const original=process.env.NODE_ENV;
  afterEach(()=>{ if(original===undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV=original; jest.restoreAllMocks(); });
  it('writes a single structured summary with counts and phase durations', () => {
    process.env.NODE_ENV='development'; const log=jest.spyOn(Logger.prototype,'log').mockImplementation(()=>{});
    const timer=onboardingPerformance('validation','org','batch'); timer.mark('batchRead'); timer.mark('peopleLinks'); timer.finish(300,0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0])).toEqual(expect.objectContaining({event:'ems_onboarding_performance',operation:'validation',rowCount:300,changedRows:0,
      phasesMs:{batchRead:expect.any(Number),peopleLinks:expect.any(Number)}}));
  });
  it('does not log in production', () => {
    process.env.NODE_ENV='production'; const log=jest.spyOn(Logger.prototype,'log').mockImplementation(()=>{});
    const timer=onboardingPerformance('detail','org','batch');timer.mark('batchRead');timer.finish(300);
    expect(log).not.toHaveBeenCalled();
  });
  it('does not log during tests', () => {
    process.env.NODE_ENV='test'; const log=jest.spyOn(Logger.prototype,'log').mockImplementation(()=>{});
    const timer=onboardingPerformance('detail','org','batch');timer.mark('batchRead');timer.finish(300);
    expect(log).not.toHaveBeenCalled();
  });
});
