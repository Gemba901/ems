import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {ChartNode} from '../components/ems/onboarding-chart';
import {layoutReportingTree,overviewCollapsed,reportingChainBadge,TREE_CARD_HEIGHT,TREE_CARD_WIDTH} from '../components/ems/onboarding-tree-layout';
const person=(id:string,parent:string|null,children:string[]=[],extra:Partial<ChartNode>={}):ChartNode=>({id,name:id,designation:'',code:'',department:'',branch:'',existing:false,parent,children,issue:null,warning:null,...extra});
const graph=()=>new Map([person('BOARD',null,['ceo']),person('ceo','BOARD',['a','b']),person('a','ceo',['c']),person('b','ceo'),person('c','a')].map(n=>[n.id,n]));
test('top-down tree has Board alone at top and peers side by side',()=>{
 const out=layoutReportingTree(graph(),['BOARD'],new Set()),p=out.positions;
 assert.equal(p.get('BOARD')!.x,p.get('ceo')!.x);assert.ok(p.get('ceo')!.y>p.get('BOARD')!.y);
 assert.equal(p.get('a')!.y,p.get('b')!.y);assert.ok(p.get('a')!.x+TREE_CARD_WIDTH<p.get('b')!.x);
});
test('each continuous edge joins parent bottom centre to child top centre',()=>{
 const out=layoutReportingTree(graph(),['BOARD'],new Set());assert.equal(out.edges.length,4);
 for(const edge of out.edges){const a=out.positions.get(edge.parent)!,b=out.positions.get(edge.child)!;
  assert.ok(edge.path.startsWith(`M ${a.x+TREE_CARD_WIDTH/2} ${a.y+TREE_CARD_HEIGHT} V `));assert.ok(edge.path.endsWith(`H ${b.x+TREE_CARD_WIDTH/2} V ${b.y}`));}
});
test('overview folds deep branches, expansion brings their descendants back',()=>{
 const nodes=graph(),collapsed=overviewCollapsed(nodes,['BOARD']);assert.ok(collapsed.has('a'));
 assert.ok(!layoutReportingTree(nodes,['BOARD'],collapsed).positions.has('c'));collapsed.delete('a');assert.ok(layoutReportingTree(nodes,['BOARD'],collapsed).positions.has('c'));
});
test('wide branches never overlap and focus keeps just the chosen subtree',()=>{
 const nodes=new Map<string,ChartNode>(),children=Array.from({length:300},(_,i)=>'p'+i);nodes.set('BOARD',person('BOARD',null,children));children.forEach(id=>nodes.set(id,person(id,'BOARD')));
 const out=layoutReportingTree(nodes,['BOARD'],new Set());const xs=children.map(id=>out.positions.get(id)!.x).sort((a,b)=>a-b);
 for(let i=1;i<xs.length;i++)assert.ok(xs[i]-xs[i-1]>TREE_CARD_WIDTH);
 assert.equal(layoutReportingTree(nodes,['p9'],new Set()).positions.size,1);
});
test('valid pending link does not gain an unresolved badge from manager personal errors',()=>{
 const nodes=graph();Object.assign(nodes.get('a')!,{status:'NEEDS_FIXING',warning:'Valid manager assignment pending'});Object.assign(nodes.get('c')!,{status:'READY',warning:'Valid manager assignment pending'});
 assert.equal(reportingChainBadge(nodes,'c'),null);nodes.get('a')!.parent=null;assert.equal(reportingChainBadge(nodes,'c'),'Unresolved chain');
});
test('circular, incomplete and excluded chains use appropriate compact labels',()=>{
 const nodes=graph();nodes.get('a')!.cycleTo='c';assert.equal(reportingChainBadge(nodes,'c'),'Circular chain');delete nodes.get('a')!.cycleTo;
 nodes.get('a')!.chainEnd='LIMIT';assert.equal(reportingChainBadge(nodes,'c'),'Chain incomplete');nodes.get('c')!.status='EXCLUDED';assert.equal(reportingChainBadge(nodes,'c'),null);
});

test('Committee and Owner are complete terminal roots for descendant badges',()=>{
 for(const id of ['COMMITTEE','MANAGEMENT_COMMITTEE','OWNER']){
  const nodes=new Map([person(id,null,['head']),person('head',id,['report'],{chainEnd:'BODY'}),person('report','head')].map(n=>[n.id,n]));
  assert.equal(reportingChainBadge(nodes,id),null);assert.equal(reportingChainBadge(nodes,'report'),null);
 }
});
