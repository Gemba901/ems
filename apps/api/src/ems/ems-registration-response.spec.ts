import { Test } from '@nestjs/testing';
import request from 'supertest';
import { EmsController } from './ems.controller';
import { EmsService } from './ems.service';
import { EmsInvitationsService } from './ems-invitations';
import { EmsRegistrationService } from './ems-registration.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';

// Transport regression only. Tenant/role enforcement is covered by the boundary suite.
describe('registration status HTTP response',()=>{
  it('returns an empty successful body for no run and never starts registration on GET',async()=>{
    const registration={status:jest.fn().mockResolvedValue(null),start:jest.fn()};
    const builder=Test.createTestingModule({controllers:[EmsController],providers:[
      {provide:EmsService,useValue:{}},{provide:EmsInvitationsService,useValue:{}},
      {provide:EmsRegistrationService,useValue:registration},
    ]});
    for(const guard of Reflect.getMetadata(GUARDS_METADATA,EmsController))builder.overrideGuard(guard).useValue({canActivate:()=>true});
    const module=await builder.compile();const app=module.createNestApplication();
    app.use((req:any,_res:any,next:any)=>{req.user={organizationId:'org',userId:'actor'};next();});
    await app.init();
    try{
      const response=await request(app.getHttpServer()).get('/ems/onboarding/batches/batch/registration').expect(200);
      expect(response.text).toBe('');
      expect(registration.status).toHaveBeenCalledWith('org','batch');
      expect(registration.start).not.toHaveBeenCalled();
    }finally{await app.close();}
  });
});
