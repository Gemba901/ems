import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {OnboardingBatchDetail} from '../services/ems.service';
import {buildOnboardingChart} from '../components/ems/onboarding-chart';
const row=(id:string,status='READY',extra={})=>({id,status,firstName:id,lastName:'Person',employeeCode:id,...extra});
function batch(records:unknown[], byRecord:unknown):OnboardingBatchDetail {
  return {records,hierarchy:{options:[],byRecord}} as unknown as OnboardingBatchDetail;
}
test('manager with personal errors remains above Ready reports',()=>{
  const graph=buildOnboardingChart(batch([row('manager','NEEDS_FIXING'),row('report')],{manager:{target:'BOARD'},report:{target:'record:manager'}}));
  assert.deepEqual(graph.roots,['BOARD']);assert.deepEqual(graph.nodes.get('record:manager')!.children,['record:report']);
  assert.equal(graph.nodes.get('record:report')!.status,'READY');
});
test('unresolved head keeps its linked reports together without inventing a Board link',()=>{
  const graph=buildOnboardingChart(batch([row('head'),row('report')],{head:{target:null,error:'Choose a manager'},report:{target:'record:head',errorScope:'UPSTREAM',error:'Head is unresolved'}}));
  assert.deepEqual(graph.roots,['record:head']);assert.deepEqual(graph.nodes.get('record:head')!.children,['record:report']);
});
test('same names remain separate by identity',()=>{
  const graph=buildOnboardingChart(batch([row('one','READY',{firstName:'Peter'}),row('two','READY',{firstName:'Peter'})],{one:{target:'BOARD'},two:{target:'record:one'}}));
  assert.equal(graph.nodes.size,3);assert.equal(graph.nodes.get('record:two')!.parent,'record:one');
});
test('registered record and employee alias render as one person',()=>{
  const graph=buildOnboardingChart(batch([row('head','REGISTERED',{employeeId:'e'}),row('report')],{head:{target:'employee:e',chain:[{target:'employee:e',name:'Head'},{target:'BOARD'}]},report:{target:'employee:e',chain:[{target:'record:report'},{target:'employee:e'},{target:'BOARD'}]}}));
  assert.equal(graph.nodes.has('record:head'),false);assert.equal(graph.nodes.get('employee:e')!.recordId,'head');
  assert.equal(graph.nodes.get('record:report')!.parent,'employee:e');assert.deepEqual(graph.roots,['BOARD']);
});
test('includes existing-manager chain but no unrelated organisation people',()=>{
  const data=batch([row('report')],{report:{target:'employee:e',chain:[{target:'record:report'},{target:'employee:e',name:'Existing manager'},{target:'BOARD'}]}});
  data.hierarchy.options=[{target:'employee:unrelated',name:'Unrelated',designation:'CEO',employeeCode:'X',department:'Other',branch:'HQ'}];
  const graph=buildOnboardingChart(data);assert.equal(graph.nodes.has('employee:unrelated'),false);assert.equal(graph.nodes.get('employee:e')!.existing,true);
});
test('cuts a cycle once and retains every person and downstream report',()=>{
  const graph=buildOnboardingChart(batch([row('a'),row('b'),row('c')],{a:{target:'record:b'},b:{target:'record:a'},c:{target:'record:b'}}));
  assert.equal(graph.roots.length,1);assert.equal([...graph.nodes.values()].filter(n=>n.cycleTo).length,1);
  const visited=new Set<string>(),queue=[...graph.roots];while(queue.length){const id=queue.pop()!;assert.ok(!visited.has(id));visited.add(id);queue.push(...graph.nodes.get(id)!.children);}
  assert.equal(visited.size,3);
});
test('self-reporting is visibly broken without infinite traversal',()=>{
  const graph=buildOnboardingChart(batch([row('self')],{self:{target:'record:self'}}));assert.equal(graph.nodes.get('record:self')!.cycleTo,'record:self');
});
test('excluded and unavailable managers stay explicit',()=>{
  const graph=buildOnboardingChart(batch([row('out','EXCLUDED'),row('a'),row('b')],{a:{target:'record:out',error:'Excluded manager'},b:{target:'employee:missing',error:'Unavailable manager'}}));
  assert.equal(graph.nodes.get('record:out')!.status,'EXCLUDED');assert.equal(graph.nodes.get('record:a')!.parent,'record:out');assert.equal(graph.nodes.get('employee:missing')!.name,'Unavailable manager');
});
test('truncated ancestor chain does not assume it reaches Board',()=>{
  const graph=buildOnboardingChart(batch([row('a')],{a:{target:'employee:e',chainEnd:'LIMIT',chain:[{target:'record:a'},{target:'employee:e',name:'Manager'}]}}));
  assert.deepEqual(graph.roots,['employee:e']);assert.match(graph.nodes.get('employee:e')!.warning!,/Further reporting levels/);
});
test('handles deep batches iteratively without modifying records',()=>{
  const rows=Array.from({length:1500},(_,i)=>row(String(i)));const resolutions=Object.fromEntries(rows.map((r,i)=>[r.id,{target:i?`record:${i-1}`:'BOARD'}]));
  const data=batch(rows,resolutions),before=JSON.stringify(data),graph=buildOnboardingChart(data);
  assert.equal(graph.nodes.size,1501);assert.deepEqual(graph.roots,['BOARD']);assert.equal(JSON.stringify(data),before);
});

for (const [body,label] of [['COMMITTEE','Committee'],['MANAGEMENT_COMMITTEE','Management Committee'],['OWNER','Owner']]) {
  test(`${label} is a separate named root, not an unavailable employee or Board alias`,()=>{
    const data=batch([row('head'),row('report')],{head:{target:body,chain:[{target:'record:head'},{target:body,name:label}],chainEnd:'BODY'},report:{target:'record:head'}});
    const graph=buildOnboardingChart(data);
    assert.deepEqual(graph.roots,[body]);assert.equal(graph.nodes.has('BOARD'),false);
    assert.equal(graph.nodes.get(body)!.name,label);assert.equal(graph.nodes.get(body)!.warning,null);
    assert.equal(graph.nodes.get('record:report')!.parent,'record:head');
  });
}
test('multiple bodies remain separate and unrelated unresolved branches are retained',()=>{
  const graph=buildOnboardingChart(batch([row('board-head'),row('owner-head'),row('unresolved')],{'board-head':{target:'BOARD'},'owner-head':{target:'OWNER'},unresolved:{target:null,error:'Choose a manager'}}));
  assert.deepEqual(new Set(graph.roots),new Set(['BOARD','OWNER','record:unresolved']));
  assert.equal(graph.nodes.get('OWNER')!.parent,null);
});
