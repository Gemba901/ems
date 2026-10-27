import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { QueryEmsEmployeesDto } from './dto/ems.dto';
import { employeeListWhere, employeeImportSource } from './ems-employee-list';

const query = (values: Record<string, unknown> = {}) => plainToInstance(QueryEmsEmployeesDto, values);
const source = (id: string, batchId: string, createdAt = '2026-10-20T12:00:00Z') => ({ id, batchId, organizationId:'org', status:'REGISTERED', rowNumber:4, registeredAt:new Date(createdAt), batch:{id:batchId,organizationId:'org',label:'Same label',sourceFileName:'staff.xlsx',createdAt:new Date(createdAt)} });
const employee = (id: string, values: Record<string, unknown> = {}) => ({id,organizationId:'org',firstName:'Anne',middleName:null,lastName:'Smith',employeeCode:`EMP-${id}`,departmentId:'dept',employmentStatus:'ACTIVE',emsOnboardingRecord:null,...values});
// Read adapter for query-contract tests. Production queries are also checked against
// generated Prisma types; these fixtures do not replace real PostgreSQL validation.
function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((part: any) => matches(row,part));
    if (key === 'OR') return value.some((part: any) => matches(row,part));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some((part: any) => matches(row,part));
    if (value && typeof value === 'object') {
      if ('is' in value) return row?.[key] != null && matches(row[key],value.is);
      if ('isNot' in value) return row?.[key] == null || !matches(row[key],value.isNot);
      if ('in' in value) return value.in.includes(row?.[key]);
      if ('not' in value) return row?.[key] !== value.not;
      if ('equals' in value) return row?.[key] != null && String(row[key]).toLowerCase() === value.equals.toLowerCase();
      if ('startsWith' in value) return row?.[key] != null && String(row[key]).toLowerCase().startsWith(value.startsWith.replace(/\\([\\%_])/g,'$1').toLowerCase());
      if ('contains' in value) return String(row?.[key] ?? '').toLowerCase().includes(value.contains.replace(/\\([\\%_])/g,'$1').toLowerCase());
    }
    return row?.[key] === value;
  });
}
function fixture(rows: any[] = []) {
  const calls: any[] = [];
  const prisma: any = {
    employee:{count:jest.fn(async({where}) => rows.filter(row=>matches(row,where)).length),findMany:jest.fn(async args => {
      calls.push(args);
      const filtered=rows.filter(row=>matches(row,args.where));
      for (const order of [...args.orderBy].reverse()) {
        const readOrder=(row:any, spec:any):[any,string] => {const key=Object.keys(spec)[0];return typeof spec[key]==='string'?[row?.[key],spec[key]]:readOrder(row?.[key],spec[key]);};
        filtered.sort((a,b)=>{const [av,dir]=readOrder(a,order),[bv]=readOrder(b,order);const c=av instanceof Date&&bv instanceof Date?av.getTime()-bv.getTime():String(av??'').localeCompare(String(bv??''));return dir==='desc'?-c:c;});
      }
      return filtered.slice(args.skip,args.skip+args.take).map(row=>({...row}));
    })},
    emsOnboardingBatch:{findMany:jest.fn(async()=>[])},
    $transaction:jest.fn(async (fn:any)=>fn(prisma)),
  };
  return {prisma,calls,service:new EmsService(prisma)};
}

test('search finds a full code beyond the first 20 employees before pagination',async()=>{
  const f=fixture([...Array.from({length:25},(_,i)=>employee(String(i))),employee('target',{employeeCode:'GB-0099',firstName:'Zuri'})]);
  const result=await f.service.getEmployees('org',query({search:' gb-0099 '}));
  expect(result.data.map(row=>row.id)).toEqual(['target']);expect(result.pagination).toEqual({page:1,limit:20,total:1,pages:1});
  expect(f.calls[0].where.AND[0]).toMatchObject({organizationId:'org',AND:[{OR:expect.arrayContaining([{employeeCode:{contains:'gb-0099',mode:'insensitive'}}])}]});
});
test('partial code and multi-part names include middle names, ignoring case and extra spaces',async()=>{
  const f=fixture([employee('a',{firstName:'Mary',middleName:'Wanjiru',lastName:'Otieno',employeeCode:'GB-1024'}),employee('b',{firstName:'Mary',lastName:'Other',employeeCode:'XX-1024'})]);
  expect((await f.service.getEmployees('org',query({search:'mary   wanjiru'}))).data.map(row=>row.id)).toEqual(['a']);
  expect((await f.service.getEmployees('org',query({search:'102'}))).pagination.total).toBe(2);
});
test('literal wildcard characters cannot broaden a code search',()=>{
  expect(employeeListWhere('org',query({search:'A_5%'})).AND).toEqual([{OR:expect.arrayContaining([{employeeCode:{contains:'A\\_5\\%',mode:'insensitive'}}])}]);
});
test('search, department, status and specific import are intersected within the organisation',async()=>{
  const f=fixture([employee('yes',{emsOnboardingRecord:source('r1','batch-a')}),employee('other-batch',{emsOnboardingRecord:source('r2','batch-b')}),employee('other-org',{organizationId:'outside',emsOnboardingRecord:source('r3','batch-a')}),employee('probation',{employmentStatus:'PROBATION',emsOnboardingRecord:source('r4','batch-a')})]);
  const result=await f.service.getEmployees('org',query({search:'Anne',departmentId:'dept',activityState:'ACTIVE',employmentStatus:'ACTIVE',importBatchId:'batch-a'}));
  expect(result.data.map(row=>row.id)).toEqual(['yes']);expect(result.data[0].sourceImport).toMatchObject({recordId:'r1',batchId:'batch-a',rowNumber:4});
  expect(result.data[0]).not.toHaveProperty('emsOnboardingRecord');
  expect(f.calls[0].where.AND[0].emsOnboardingRecord.is).toEqual({organizationId:'org',status:'REGISTERED',batch:{is:{organizationId:'org'}},batchId:'batch-a'});
});
test('foreign source batch IDs return no employees and never broaden to all sources',async()=>{
  const f=fixture([employee('a',{emsOnboardingRecord:source('r','batch-a')})]);
  const result=await f.service.getEmployees('org',query({importBatchId:'foreign-batch'}));
  expect(result.data).toEqual([]);expect(result.pagination.total).toBe(0);
});
test('no linked import includes legacy profiles, not matched names or unfinished import rows',async()=>{
  const f=fixture([employee('legacy'),employee('draft',{emsOnboardingRecord:{...source('r2','batch'),status:'DRAFT'}}),employee('registered',{emsOnboardingRecord:source('r3','batch')})]);
  const result=await f.service.getEmployees('org',query({source:'UNLINKED'}));
  expect(result.data.map(row=>row.id).sort()).toEqual(['draft','legacy']);expect(result.data.every(row=>row.sourceImport===null)).toBe(true);
  expect((await f.service.getEmployees('org',query({source:'IMPORTED'}))).data.map(row=>row.id)).toEqual(['registered']);
});
test('source details refuse a corrupt cross-organisation link',()=>{
  expect(employeeImportSource({...source('r','b'),organizationId:'other'} as never,'org')).toBeNull();
  const record=source('r','b');record.batch.organizationId='other';expect(employeeImportSource(record as never,'org')).toBeNull();
});
test('out-of-range pages clamp to the last page using the filtered count',async()=>{
  const f=fixture(Array.from({length:21},(_,i)=>employee(String(i))));
  const result=await f.service.getEmployees('org',query({page:999}));
  expect(result.pagination).toEqual({page:2,limit:20,total:21,pages:2});expect(result.data).toHaveLength(1);
  expect(f.calls[0]).toMatchObject({skip:20,take:20});
  expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'RepeatableRead'});
});
test('empty results keep a valid page without claiming any records',async()=>{
  const result=await fixture().service.getEmployees('org',query({page:9}));
  expect(result).toMatchObject({data:[],pagination:{page:1,pages:0,total:0}});
});
test.each(['NAME_ASC','NAME_DESC'])('%s uses a stable ID tie-breaker for identical names',async sort=>{
  const f=fixture([employee('b'),employee('a'),employee('c')]);
  const result=await f.service.getEmployees('org',query({limit:2,sort}));expect(result.data.map(row=>row.id)).toEqual(['a','b']);
  expect(f.calls[0].orderBy.at(-1)).toEqual({id:'asc'});
});
test.each(['IMPORT_NEWEST','IMPORT_OLDEST'])('%s keeps unlinked employees last and crosses the page boundary without skipping',async sort=>{
  const f=fixture([employee('old',{emsOnboardingRecord:source('r1','b1','2026-01-01T00:00:00Z')}),employee('new',{emsOnboardingRecord:source('r2','b2','2026-10-01T00:00:00Z')}),employee('unlinked-a'),employee('unlinked-b')]);
  const first=await f.service.getEmployees('org',query({limit:3,sort}));
  expect(first.data.map(row=>row.id)).toEqual([...(sort==='IMPORT_NEWEST'?['new','old']:['old','new']),'unlinked-a']);
  const next=await f.service.getEmployees('org',query({page:2,limit:3,sort}));expect(next.data.map(row=>row.id)).toEqual(['unlinked-b']);
  expect(f.calls.every(args=>args.take<=3)).toBe(true);
});
test('inconsistent source or employment filters are rejected',async()=>{
  const f=fixture();await expect(f.service.getEmployees('org',query({source:'UNLINKED',importBatchId:'batch'}))).rejects.toThrow('either');
  await expect(f.service.getEmployees('org',query({activityState:'ACTIVE',employmentStatus:'RETIRED'}))).rejects.toThrow('does not belong');
  expect(f.prisma.$transaction).not.toHaveBeenCalled();
});
test('import choices only query batches containing linked employees in the trusted organisation',async()=>{
  const f=fixture();f.prisma.emsOnboardingBatch.findMany.mockResolvedValue([{id:'b',label:'Batch',sourceFileName:'file.xlsx',createdAt:new Date('2026-01-01')}]);
  expect(await f.service.getEmployeeImportBatches('org')).toEqual([{id:'b',label:'Batch',sourceFileName:'file.xlsx',importedAt:new Date('2026-01-01')}]);
  expect(f.prisma.emsOnboardingBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:'org',records:{some:{organizationId:'org',status:'REGISTERED',employee:{is:{organizationId:'org'}}}}}}));
});
test('import-source route uses trusted organisation and HR/admin permissions',async()=>{
  const service={getEmployeeImportBatches:jest.fn(async()=>[])};const controller=new EmsController(service as unknown as EmsService, {} as never);
  await controller.getEmployeeImportBatches({organizationId:'trusted-org'});expect(service.getEmployeeImportBatches).toHaveBeenCalledWith('trusted-org');
  expect(Reflect.getMetadata('roles',EmsController.prototype.getEmployeeImportBatches)).toEqual(expect.arrayContaining(['ADMIN','HR','SUPER_ADMIN']));
  expect(Reflect.getMetadata('roles',EmsController.prototype.getEmployeeImportBatches)).not.toContain('EMPLOYEE');
});
test.each([{page:1.5},{page:0},{page:'wat'},{limit:101},{limit:0},{sort:'raw sql'},{source:'ALL_ORGS'},{search:'x'.repeat(201)},{importBatchId:''}])('DTO rejects invalid query %j',async values=>{
  expect((await validate(query(values))).length).toBeGreaterThan(0);
});
test('DTO accepts optional filters, converts page inputs and trims the search',async()=>{
  const dto=query({page:'2',limit:'20',search:'  EMP-01 ',source:'IMPORTED',sort:'IMPORT_NEWEST'});
  expect(await validate(dto)).toEqual([]);expect(dto).toMatchObject({page:2,limit:20,search:'EMP-01'});expect(await validate(query())).toEqual([]);
});

test('na finds exact names, then Nancy and Naomi, before Diana even when alphabetically earlier',async()=>{
  const f=fixture([employee('d',{firstName:'Diana'}),employee('n2',{firstName:'Naomi'}),employee('n1',{firstName:'Nancy'}),employee('exact',{firstName:'Na'})]);
  expect((await f.service.getEmployees('org',query({search:'na'}))).data.map(e=>e.firstName)).toEqual(['Na','Nancy','Naomi','Diana']);
});
test('a later prefix match appears on page one ahead of 45 earlier substring matches',async()=>{
  const f=fixture([...Array.from({length:45},(_,i)=>employee(`d${i}`,{firstName:'Diana'})),employee('prefix',{firstName:'Nancy'})]);
  const result=await f.service.getEmployees('org',query({search:'na',limit:20}));
  expect(result.data[0].id).toBe('prefix');expect(result.pagination).toEqual({page:1,pages:3,total:46,limit:20});
  expect(f.calls.reduce((sum,c)=>sum+c.take,0)).toBe(20);expect(f.prisma.employee.count.mock.calls.length).toBeLessThanOrEqual(3);
});
test('pagination crosses all three ranks without repeats, gaps or unstable ties',async()=>{
  const f=fixture([employee('x',{firstName:'Na'}),employee('b',{firstName:'Nancy'}),employee('a',{firstName:'Nancy'}),employee('c',{firstName:'Naomi'}),employee('d',{firstName:'Diana'}),employee('e',{firstName:'Luna'})]);
  const ids:string[]=[];
  for(let page=1;page<=3;page++)ids.push(...(await f.service.getEmployees('org',query({search:'na',page,limit:2}))).data.map(e=>e.id));
  expect(ids).toEqual(['x','a','b','c','d','e']);expect(new Set(ids).size).toBe(6);
});
test('exact employee code beats a code prefix, which beats a code containing the text',async()=>{
  const f=fixture([employee('contains',{employeeCode:'XX-GB-01',firstName:'Abel'}),employee('prefix',{employeeCode:'GB-0100',firstName:'Beth'}),employee('exact',{employeeCode:'GB-01',firstName:'Zuri'})]);
  expect((await f.service.getEmployees('org',query({search:'gb-01'}))).data.map(e=>e.id)).toEqual(['exact','prefix','contains']);
});
test('middle names, surnames and compound name parts participate in prefix rank',async()=>{
  const f=fixture([employee('contains',{firstName:'Diana'}),employee('surname',{firstName:'Zuri',lastName:'Nakuru'}),employee('middle',{firstName:'Sarah',middleName:'Naomi'}),employee('compound',{firstName:'Mary Nancy'}),employee('hyphen',{firstName:'Mary-Nancy'})]);
  const ids=(await f.service.getEmployees('org',query({search:'na'}))).data.map(e=>e.id);
  expect(ids.slice(0,4).sort()).toEqual(['compound','hyphen','middle','surname']);expect(ids.at(-1)).toBe('contains');
});
test('case and repeated spaces do not change multi-word exact/prefix/contains priority',async()=>{
  const f=fixture([employee('contains',{firstName:'Rosemary',lastName:'Kwanana'}),employee('prefix',{firstName:'Maryanne',lastName:'Nakuru'}),employee('exact',{firstName:'Mary',lastName:'Na'})]);
  expect((await f.service.getEmployees('org',query({search:'  MARY   na  '}))).data.map(e=>e.id)).toEqual(['exact','prefix','contains']);
});
test('nullable middle names and employee codes do not remove lower-ranked matches',async()=>{
  const f=fixture([employee('prefix',{firstName:'Nancy',employeeCode:null,middleName:null}),employee('contains',{firstName:'Diana',employeeCode:null,middleName:null})]);
  expect((await f.service.getEmployees('org',query({search:'na'}))).data.map(e=>e.id)).toEqual(['prefix','contains']);
  const filters=JSON.stringify(f.calls.map(c=>c.where));expect(filters).toContain('"middleName":{"not":null}');expect(filters).toContain('"employeeCode":{"not":null}');
});
test('best-match pages honour organisation, department, status and import filters at every rank',async()=>{
  const match={emsOnboardingRecord:source('r','batch-a')};
  const f=fixture([employee('allowed',{firstName:'Diana',...match}),employee('outside',{organizationId:'foreign',firstName:'Na',...match}),employee('wrong-batch',{firstName:'Nancy',emsOnboardingRecord:source('r2','batch-b')}),employee('inactive',{firstName:'Naomi',employmentStatus:'RETIRED',...match}),employee('wrong-dept',{firstName:'Nana',departmentId:'other',...match})]);
  const result=await f.service.getEmployees('org',query({search:'na',departmentId:'dept',employmentStatus:'ACTIVE',importBatchId:'batch-a',sort:'BEST_MATCH'}));
  expect(result.data.map(e=>e.id)).toEqual(['allowed']);expect(result.pagination.total).toBe(1);
});
test.each(['NAME_ASC','NAME_DESC'])('explicit %s overrides relevance while preserving search',async sort=>{
  const f=fixture([employee('n',{firstName:'Nancy'}),employee('d',{firstName:'Diana'}),employee('other',{firstName:'Mary'})]);
  expect((await f.service.getEmployees('org',query({search:'na',sort}))).data.map(e=>e.id)).toEqual(sort==='NAME_ASC'?['d','n']:['n','d']);
  expect(f.prisma.employee.count).toHaveBeenCalledTimes(1);
});
test.each(['IMPORT_NEWEST','IMPORT_OLDEST'])('explicit %s overrides relevance and still puts unlinked matches last',async sort=>{
  const f=fixture([employee('old',{firstName:'Nancy',emsOnboardingRecord:source('r1','b1','2026-01-01T00:00:00Z')}),employee('new',{firstName:'Diana',emsOnboardingRecord:source('r2','b2','2026-10-01T00:00:00Z')}),employee('unlinked',{firstName:'Na'})]);
  expect((await f.service.getEmployees('org',query({search:'na',sort}))).data.map(e=>e.id)).toEqual([...(sort==='IMPORT_NEWEST'?['new','old']:['old','new']),'unlinked']);
});
test('BEST_MATCH without a search falls back to stable name order',async()=>{
  const f=fixture([employee('b',{firstName:'Nancy'}),employee('a',{firstName:'Diana'})]);
  expect((await f.service.getEmployees('org',query({sort:'BEST_MATCH'}))).data.map(e=>e.id)).toEqual(['a','b']);
  expect(f.prisma.employee.count).toHaveBeenCalledTimes(1);
});
test('ranked page clamps after a filter changes and an empty search result stays valid',async()=>{
  const f=fixture([employee('n',{firstName:'Nancy'}),employee('d',{firstName:'Diana'})]);
  expect(await f.service.getEmployees('org',query({search:'na',limit:1,page:9}))).toMatchObject({data:[{id:'d'}],pagination:{page:2,total:2,pages:2}});
  expect(await f.service.getEmployees('org',query({search:'no-match',page:9}))).toMatchObject({data:[],pagination:{page:1,total:0,pages:0}});
});
test('literal code punctuation stays literal when ranking exact and prefix matches',async()=>{
  const f=fixture([employee('false',{employeeCode:'AX5Z'}),employee('prefix',{employeeCode:'A_5%99'}),employee('exact',{employeeCode:'A_5%'}),employee('contains',{employeeCode:'XA_5%'})]);
  expect((await f.service.getEmployees('org',query({search:'A_5%'}))).data.map(e=>e.id)).toEqual(['exact','prefix','contains']);
});
test('DTO accepts BEST_MATCH as a validated sort value',async()=>{
  expect(await validate(query({sort:'BEST_MATCH',search:'na'}))).toEqual([]);
});
