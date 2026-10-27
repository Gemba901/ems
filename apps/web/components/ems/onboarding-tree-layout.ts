import { isReportingBody } from './reporting-bodies';
import type { ChartNode } from './onboarding-chart';
export const TREE_CARD_WIDTH = 172;
export const TREE_CARD_HEIGHT = 108;
const GAP_X = 22, GAP_Y = 56, PAD = 24;
export type TreePosition = {id:string; x:number; y:number; depth:number};
/** Top-down, non-overlapping subtree layout. Works on the cycle-safe display graph. */
export function layoutReportingTree(nodes:Map<string,ChartNode>,roots:string[],collapsed:Set<string>) {
  const order: {id:string;depth:number}[] = [], pending=roots.slice().reverse().map(id=>({id,depth:0}));
  const seen=new Set<string>();
  while(pending.length){const item=pending.pop()!;if(seen.has(item.id)||!nodes.has(item.id))continue;seen.add(item.id);order.push(item);
    if(!collapsed.has(item.id))nodes.get(item.id)!.children.slice().reverse().forEach(id=>pending.push({id,depth:item.depth+1}));}
  const widths=new Map<string,number>();
  for(let i=order.length-1;i>=0;i--){const id=order[i].id,children=collapsed.has(id)?[]:nodes.get(id)!.children.filter(c=>seen.has(c));
    widths.set(id,Math.max(TREE_CARD_WIDTH,children.reduce((n,c)=>n+(widths.get(c)??TREE_CARD_WIDTH),0)+Math.max(0,children.length-1)*GAP_X));}
  let rootLeft=PAD;const offsets=new Map<string,number>();
  for(const id of roots){if(!widths.has(id))continue;offsets.set(id,rootLeft);rootLeft+=widths.get(id)!+GAP_X;}
  const positions=new Map<string,TreePosition>();
  for(const {id,depth} of order){const left=offsets.get(id)??PAD,width=widths.get(id)!;
    positions.set(id,{id,depth,x:left+(width-TREE_CARD_WIDTH)/2,y:PAD+depth*(TREE_CARD_HEIGHT+GAP_Y)});
    let childLeft=left;if(!collapsed.has(id))for(const child of nodes.get(id)!.children){offsets.set(child,childLeft);childLeft+=(widths.get(child)??TREE_CARD_WIDTH)+GAP_X;}}
  const edges:{parent:string;child:string;path:string}[]=[];
  for(const point of positions.values())if(!collapsed.has(point.id))for(const child of nodes.get(point.id)!.children){const next=positions.get(child);if(!next)continue;
    const x1=point.x+TREE_CARD_WIDTH/2,y1=point.y+TREE_CARD_HEIGHT,x2=next.x+TREE_CARD_WIDTH/2,y2=next.y,bus=y1+GAP_Y/2;
    edges.push({parent:point.id,child,path:`M ${x1} ${y1} V ${bus} H ${x2} V ${y2}`});}
  return {positions,edges,width:Math.max(TREE_CARD_WIDTH+PAD*2,rootLeft-GAP_X+PAD),height:Math.max(TREE_CARD_HEIGHT+PAD*2,...order.map(p=>PAD*2+TREE_CARD_HEIGHT+p.depth*(TREE_CARD_HEIGHT+GAP_Y)))};
}
/** Start with each reporting body and two reporting levels; expand only the branches HR needs. */
export function overviewCollapsed(nodes:Map<string,ChartNode>,roots:string[]) {
  const collapsed=new Set<string>(),seen=new Set<string>(),pending=roots.map(id=>({id,depth:0}));
  while(pending.length){const {id,depth}=pending.pop()!;if(seen.has(id)||!nodes.has(id))continue;seen.add(id);
    const node=nodes.get(id)!;if(depth>=2&&node.children.length)collapsed.add(id);
    node.children.forEach(child=>pending.push({id:child,depth:depth+1}));}
  return collapsed;
}
export function reportingChainBadge(nodes:Map<string,ChartNode>,id:string):string|null {
  const node=nodes.get(id);if(!node||isReportingBody(id)||node.status==='EXCLUDED')return null;
  let current:ChartNode|undefined=node;const seen=new Set<string>();let problem=!!node.issue;
  while(current&&!isReportingBody(current.id)){
    if(current.cycleTo||current.chainEnd==='CYCLE'||seen.has(current.id))return 'Circular chain';
    if(current.chainEnd==='LIMIT')return 'Chain incomplete';
    problem ||= !!current.issue;seen.add(current.id);
    if(!current.parent)return 'Unresolved chain';current=nodes.get(current.parent);
  }
  return !current||problem?'Unresolved chain':null;
}
