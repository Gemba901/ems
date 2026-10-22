import { isReportingBody, reportingBodyLabel } from './reporting-bodies';
import type { OnboardingBatchDetail, OnboardingRecordStatus } from '@/services/ems.service';

export type ChartNode = {
  id: string; name: string; designation: string; code: string; department: string; branch: string;
  recordId?: string; status?: OnboardingRecordStatus; existing: boolean; parent: string | null;
  children: string[]; issue: string | null; warning: string | null; cycleTo?: string; chainEnd?: 'BOARD'|'BODY'|'UNRESOLVED'|'UNKNOWN'|'CYCLE'|'LIMIT';
};

/** Display only. Never infer a manager from names, job titles or HOD assignments. */
export function buildOnboardingChart(batch: OnboardingBatchDetail) {
  const nodes = new Map<string, ChartNode>(), aliases = new Map<string, string>();
  for (const record of batch.records) if (record.status === 'REGISTERED' && record.employeeId)
    aliases.set(`record:${record.id}`, `employee:${record.employeeId}`);
  const canonical = (id: string) => aliases.get(id) ?? id;
  const options = new Map(batch.hierarchy.options.map(option => [canonical(option.target), option]));
  const ensure = (target: string, info?: { name?: string; designation?: string; employeeCode?: string }) => {
    const id = canonical(target);
    if (!nodes.has(id)) {
      const option = options.get(id);
      nodes.set(id, {id, name: info?.name || option?.name || (reportingBodyLabel(id) ?? 'Unavailable manager'),
        designation: info?.designation || option?.designation || '', code: info?.employeeCode || option?.employeeCode || '',
        department: option?.department ?? '', branch: option?.branch ?? '', existing: id.startsWith('employee:'),
        parent:null, children:[], issue:null, warning:null});
    }
    return nodes.get(id)!;
  };
  for (const record of batch.records) {
    const node = ensure(`record:${record.id}`);
    Object.assign(node, {recordId:record.id, name:[record.firstName,record.middleName,record.lastName].filter(Boolean).join(' ') || 'Unnamed record',
      designation:record.jobDesignation ?? '', code:record.employeeCode ?? '', department:record.currentDepartment ?? '',
      branch:record.plantBranchCode ?? '', status:record.status});
  }
  for (const record of batch.records) {
    const resolution = batch.hierarchy.byRecord[record.id], node = nodes.get(canonical(`record:${record.id}`))!;
    if (record.status === 'EXCLUDED') continue;
    node.issue = resolution?.error ?? null; node.warning = resolution?.warning ?? null; node.chainEnd = resolution?.chainEnd;
    const chain = resolution?.chain ?? [];
    for (let i=0;i<chain.length;i++) {
      const child = ensure(chain[i].target, chain[i]), next = chain[i+1];
      if (next && canonical(next.target) !== child.id) child.parent = ensure(next.target,next).id;
      if (!next && !isReportingBody(child.id) && !child.recordId) child.chainEnd = resolution?.chainEnd;
      if (!next && !isReportingBody(child.id) && !child.recordId) child.warning = resolution?.chainEnd === 'LIMIT'
        ? 'Further reporting levels are not included in this preview.'
        : resolution?.chainEnd === 'CYCLE' ? 'Circular reporting chain.' : 'Reporting above this person is unresolved or unavailable.';
    }
    if (!resolution?.target && !node.issue) node.warning ||= 'Reporting person has not been resolved.';
  }
  // A row's direct resolution takes precedence over incidental copies in other chains.
  // Registered rows resolve to their own employee alias; their parent comes from the chain.
  for (const record of batch.records) {
    const node = nodes.get(canonical(`record:${record.id}`))!;
    if (record.status === 'EXCLUDED') node.parent = null;
    else if (record.status !== 'REGISTERED') {
      const target = batch.hierarchy.byRecord[record.id]?.target;
      node.parent = target ? ensure(target).id : null;
    }
  }
  // Break one visible edge per cycle, retaining the target as an explicit warning.
  // Iterative traversal handles deep imports and does not hide reports below a loop.
  const done = new Set<string>();
  for (const start of nodes.keys()) {
    const path: string[] = [], positions = new Map<string,number>(); let id: string | null = start;
    while (id && !done.has(id)) {
      if (positions.has(id)) {
        const cycle = path.slice(positions.get(id)!); const cut = nodes.get(cycle[0])!;
        cut.cycleTo = cut.parent!; cut.parent = null;
        for (const target of cycle) nodes.get(target)!.issue ||= 'Circular reporting chain.';
        break;
      }
      positions.set(id,path.length); path.push(id); id = nodes.get(id)?.parent ?? null;
    }
    path.forEach(target => done.add(target));
  }
  for (const node of nodes.values()) if (node.parent) nodes.get(node.parent)?.children.push(node.id);
  // Preserve the already sorted batch order; existing managers are included only as context.
  const order = new Map(batch.records.map((record,i)=>[canonical(`record:${record.id}`),i]));
  const compare = (a:string,b:string) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity)
    || nodes.get(a)!.name.localeCompare(nodes.get(b)!.name) || a.localeCompare(b);
  nodes.forEach(node=>node.children.sort(compare));
  const roots = [...nodes.values()].filter(node=>!node.parent).map(node=>node.id).sort(compare);
  return {nodes, roots: [...roots.filter(id=>isReportingBody(id)), ...roots.filter(id=>!isReportingBody(id))]};
}
