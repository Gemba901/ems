"use client";
import { isReportingBody, reportingBodyLabel } from './reporting-bodies';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { OnboardingBatchDetail } from '@/services/ems.service';
import { RECORD_STATUS_LABELS } from '@/services/ems.service';
import { buildOnboardingChart } from './onboarding-chart';
import { layoutReportingTree, overviewCollapsed, reportingChainBadge, TREE_CARD_HEIGHT, TREE_CARD_WIDTH } from './onboarding-tree-layout';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = { batch: OnboardingBatchDetail; busy: boolean; dirty: boolean; onViewRecord:(id:string)=>void };
function Chart({batch,busy,onViewRecord}:Props) {
  const graph = useMemo(()=>buildOnboardingChart(batch),[batch]);
  const [collapsed,setCollapsed]=useState(()=>overviewCollapsed(graph.nodes,graph.roots));
  const [search,setSearch]=useState(''),[focus,setFocus]=useState<string|null>(null),[other,setOther]=useState(false);
  const [selected,setSelected]=useState<string|null>(null),[zoom,setZoom]=useState(1);
  const viewport=useRef<HTMLDivElement>(null),centerOn=useRef<string|null>('BOARD');
  const bodyRoots=graph.roots.filter(isReportingBody),otherRoots=graph.roots.filter(id=>!isReportingBody(id));
  const connectedLabel=bodyRoots.length===1?`Connected to ${reportingBodyLabel(bodyRoots[0])}`:'Connected hierarchies';
  const focusedNode=focus?graph.nodes.get(focus):undefined;
  const viewName=other?'Unconnected':connectedLabel;
  const connectedCount=useMemo(()=>{let count=0;const pending=graph.roots.filter(isReportingBody) as string[],seen=new Set<string>();
    while(pending.length){const id=pending.pop()!;if(seen.has(id))continue;seen.add(id);const node=graph.nodes.get(id);if(!node)continue;
      if(node.recordId)count++;pending.push(...node.children);}return count;},[graph]);
  const roots=focusedNode?[focusedNode.id]:other?otherRoots:bodyRoots;
  const layout=useMemo(()=>layoutReportingTree(graph.nodes,roots,collapsed),[graph,roots.join('|'),collapsed]);
  useLayoutEffect(()=>{const box=viewport.current;if(!box)return;const point=layout.positions.get(centerOn.current??'')??layout.positions.values().next().value;
    if(point)box.scrollLeft=Math.max(0,(point.x+TREE_CARD_WIDTH/2)*zoom-box.clientWidth/2);},[layout,zoom]);
  const needle=search.trim().toLocaleLowerCase();
  const matches=needle?[...graph.nodes.values()].filter(n=>n.recordId&&`${n.name} ${n.code}`.toLocaleLowerCase().includes(needle)):[];
  const detail=selected?graph.nodes.get(selected):undefined;
  const focusBranch=(id:string)=>{let root=graph.nodes.get(id);const seen=new Set<string>();while(root?.parent&&!seen.has(root.id)){seen.add(root.id);root=graph.nodes.get(root.parent);}setOther(!isReportingBody(root?.id));centerOn.current=id;setFocus(id);setCollapsed(overviewCollapsed(graph.nodes,[id]));setSearch('');setSelected(null);setZoom(1);if(viewport.current)viewport.current.scrollTop=0;};
  const overview=(showOther=false)=>{centerOn.current=showOther?otherRoots[0]:bodyRoots[0];setFocus(null);setOther(showOther);setSelected(null);setSearch('');setCollapsed(overviewCollapsed(graph.nodes,graph.roots));setZoom(1);if(viewport.current)viewport.current.scrollTop=0;};
  const toggle=(id:string)=>{centerOn.current=id;setCollapsed(previous=>{const next=new Set(previous);next.has(id)?next.delete(id):next.add(id);return next;});};
  const control='rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:bg-primary/10';
  const viewButton=(active:boolean)=>`rounded-md border px-3 py-1.5 text-xs font-semibold focus-visible:outline-ring ${active?'border-primary bg-primary text-primary-foreground shadow-sm':'border-border bg-card text-muted-foreground hover:bg-primary/10'}`;
  return <div className="space-y-3 border-t border-border p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Input aria-label="Find a person or code" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find name or code"
        className="min-w-0 flex-1 rounded-md border border-border px-3 py-1.5 text-sm" />
      <div role="group" aria-label="Hierarchy view" className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        <Button variant="ghost" type="button" aria-pressed={!other} onClick={()=>overview()} title={`${connectedCount} import records with a path to a top-level reporting body`} className={`${viewButton(!other)} h-auto whitespace-normal`}>{connectedLabel} ({connectedCount})</Button>
        <Button variant="ghost" type="button" aria-pressed={other} onClick={()=>overview(true)} title={`${batch.records.length-connectedCount} import records without a path to a top-level reporting body`} className={`${viewButton(other)} h-auto whitespace-normal`}>Unconnected ({batch.records.length-connectedCount})</Button>
      </div>
    </div>
    {needle&&<div className="max-h-36 overflow-auto rounded-lg border border-border p-2" aria-label="Hierarchy search results">
      {!matches.length&&<p className="text-xs text-muted-foreground">No matching person in this import.</p>}
      {matches.map(n=><Button variant="ghost" key={n.id} type="button" onClick={()=>focusBranch(n.id)} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-primary/10 h-auto whitespace-normal">{n.name} · {n.code||'No code'} <span className="text-xs text-primary">Show branch</span></Button>)}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{focusedNode?`Viewing ${focusedNode.name}’s branch`:other?'Unconnected · no path to a top-level body':`${connectedLabel} · saved reporting paths`}</span>
        {focusedNode&&<Button variant="ghost" type="button" onClick={()=>overview(other)} className="font-semibold text-primary underline h-auto whitespace-normal">Back to {viewName}</Button>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" type="button" aria-label="Zoom out" disabled={zoom<=0.25} onClick={()=>setZoom(z=>Math.max(.25,z-.15))} className={`${control} h-auto whitespace-normal`}>−</Button>
        <span className="w-10 text-center">{Math.round(zoom*100)}%</span>
        <Button variant="ghost" type="button" aria-label="Zoom in" disabled={zoom>=1.5} onClick={()=>setZoom(z=>Math.min(1.5,z+.15))} className={`${control} h-auto whitespace-normal`}>+</Button>
        <Button variant="ghost" type="button" onClick={()=>setZoom(Math.min(1,Math.max(.25,((viewport.current?.clientWidth??layout.width)-16)/layout.width)))} className={`${control} h-auto whitespace-normal`}>Fit</Button>
        <Button variant="ghost" type="button" onClick={()=>{setCollapsed(overviewCollapsed(graph.nodes,roots));setZoom(1);centerOn.current=roots[0];}} className={`${control} h-auto whitespace-normal`}>Overview</Button>
      </div>
    </div>
    <div ref={viewport} aria-label="Reporting hierarchy chart" tabIndex={0} className="overflow-auto rounded-lg border border-border bg-muted focus-visible:outline-ring" style={{maxHeight:'min(62vh, 540px)',minHeight:roots.length?180:80}}>
      {!roots.length?<p className="p-4 text-sm text-muted-foreground">{other?'No unconnected branches.':'No links to a top-level reporting body yet. Choose Unconnected or search for a person.'}</p>:
      <div style={{width:Math.max(1,layout.width*zoom),height:layout.height*zoom,margin:'0 auto',position:'relative'}}>
        <div role="group" aria-label="Reporting tree" style={{position:'absolute',width:layout.width,height:layout.height,transform:`scale(${zoom})`,transformOrigin:'top left'}}>
          <svg aria-hidden="true" width={layout.width} height={layout.height} style={{position:'absolute',inset:0,pointerEvents:'none'}}>
            {layout.edges.map(edge=><path key={edge.child} d={edge.path} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />)}
          </svg>
          {[...layout.positions.values()].map(point=>{const node=graph.nodes.get(point.id)!,badge=reportingChainBadge(graph.nodes,node.id);return <div key={node.id} data-tree-node={node.id}
            style={{position:'absolute',left:point.x,top:point.y,width:TREE_CARD_WIDTH,height:TREE_CARD_HEIGHT}}>
            <Button variant="ghost" type="button" aria-label={`Details for ${node.name}${node.code?' · '+node.code:''}`} aria-pressed={selected===node.id} onClick={()=>setSelected(selected===node.id?null:node.id)}
              title={[node.name,node.code,node.designation].filter(Boolean).join(' · ')}
              className={`whitespace-normal flex h-full w-full flex-col items-center justify-center rounded-lg border-2 px-2 py-1.5 text-center shadow-sm ${isReportingBody(node.id)?'border-primary bg-primary/10':selected===node.id?'border-primary bg-card':badge?'border-warning bg-card':'border-border bg-card'}`}>
              <strong className="line-clamp-2 text-xs leading-4 text-foreground">{node.name}</strong>
              {!isReportingBody(node.id)&&<span className="mt-0.5 block w-full truncate text-[10px] text-muted-foreground">{[node.code,node.designation].filter(Boolean).join(' · ')}</span>}
              {node.status&&<span className={`mt-1 rounded px-1.5 py-0.5 text-[10px] leading-3 ${node.status==='READY'?'bg-success-subtle text-success':node.status==='NEEDS_FIXING'?'bg-warning-subtle text-warning':'bg-muted text-muted-foreground'}`}>{RECORD_STATUS_LABELS[node.status]}</span>}
              {!node.recordId&&!isReportingBody(node.id)&&<span className="mt-1 text-[10px] text-muted-foreground">{node.existing?'Existing employee':'Other import'}</span>}
              {badge&&<span className="mt-1 text-[10px] font-semibold leading-3 text-warning">{badge}</span>}
              {isReportingBody(node.id)&&<span className="mt-1 text-[10px] text-primary">Reporting hierarchy</span>}
            </Button>
            {node.children.length>0&&<Button variant="ghost" type="button" onClick={()=>toggle(node.id)} aria-expanded={!collapsed.has(node.id)} aria-label={`${collapsed.has(node.id)?'Expand':'Collapse'} reports of ${node.name}`}
              title={`${node.children.length} direct reports shown`} className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-card text-xs font-bold text-primary shadow-sm h-auto whitespace-normal" style={{bottom:-15,minWidth:32,height:28,padding:'0 6px'}}>{collapsed.has(node.id)?'+':'−'} <span className="ml-1 text-[10px] font-normal">{node.children.length}</span></Button>}
          </div>;})}
        </div>
      </div>}
    </div>
    <p className="text-[11px] text-muted-foreground">The two views show separate groups. Connected records can still have personal fields to correct. Click a person for details. Scroll sideways for wide branches, or use Fit. Record status and reporting-chain status are separate.</p>
    {detail&&<div role="region" aria-label="Selected person details" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs">
      <div className="flex items-start justify-between gap-2"><strong className="text-sm text-foreground">{detail.name}</strong><Button variant="ghost" type="button" onClick={()=>setSelected(null)} className="text-primary underline h-auto whitespace-normal">Close details</Button></div>
      <p className="mt-1 text-muted-foreground">{[detail.designation,detail.code,detail.department,detail.branch].filter(Boolean).join(' · ')}</p>
      {detail.parent&&<p className="mt-1">Reports to {graph.nodes.get(detail.parent)?.name}</p>}
      {detail.issue&&<p className="mt-2 text-warning">{detail.issue}</p>}
      {!detail.issue&&detail.warning&&<p className="mt-2 text-warning">{detail.warning}</p>}
      {detail.cycleTo&&<p className="mt-1 text-warning">Circular link to {graph.nodes.get(detail.cycleTo)?.name}; the repeated connection is omitted.</p>}
      <div className="mt-2 flex flex-wrap gap-4">
        {detail.recordId&&<Button variant="ghost" type="button" disabled={busy} onClick={()=>onViewRecord(detail.recordId!)} className="font-semibold text-primary underline disabled:opacity-40 h-auto whitespace-normal">Open record</Button>}
        {detail.children.length>0&&<Button variant="ghost" type="button" onClick={()=>focusBranch(detail.id)} className="font-semibold text-primary underline h-auto whitespace-normal">Focus this branch</Button>}
      </div>
    </div>}
  </div>;
}
export default function OnboardingHierarchyChart(props:Props) {
  const [open,setOpen]=useState(false);
  return <section data-viewport-anchor="batch-hierarchy" className="rounded-xl border border-border bg-card" aria-label="Import reporting hierarchy">
    <Button variant="ghost" type="button" aria-expanded={open} aria-controls="onboarding-hierarchy-chart" onClick={()=>setOpen(!open)} className="flex w-full items-center justify-between gap-2 p-3 text-left h-auto whitespace-normal">
      <span><span className="block text-sm font-semibold text-foreground">Reporting hierarchy</span><span className="block text-xs text-muted-foreground">{props.batch.records.length} import records · all pages</span></span>
      <span className="shrink-0 text-xs font-semibold text-primary">{open?'Hide chart':'Show chart'}</span>
    </Button>
    {open&&<div id="onboarding-hierarchy-chart"><p className="px-3 pb-2 text-xs text-muted-foreground">Saved reporting links, including existing managers for context.{props.dirty?' Unsaved edits appear after saving.':''}</p><Chart {...props}/></div>}
  </section>;
}
