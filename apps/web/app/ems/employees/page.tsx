"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { EmsService, type EmployeeListSort, type EmploymentStatus, type EmployeeInvitationFilter, type EmployeeListFilters, EMPLOYMENT_STATUS_LABELS, completionBg } from "@/services/ems.service";
import InvitationDialog from "@/components/ems/InvitationDialog";
import { invitationBadge } from "@/components/ems/ems-invitations";
import { saveEmployeeNav } from "@/components/ems/employee-navigation";
import { reviewRecordHref } from "@/components/ems/onboarding-review-navigation";
import { Search, ChevronLeft, ChevronRight, Loader2, ArrowLeft, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;
// Invitation states share the status filter (as "INVITE:…") rather than taking a permanent column.
type StatusFilter = EmploymentStatus | "ACTIVE_GROUP" | "INACTIVE_GROUP" | `INVITE:${EmployeeInvitationFilter}` | "";
const initialFilters = { page: 1, search: "", status: "" as StatusFilter, source: "", sort: "BEST_MATCH" as EmployeeListSort };
const fieldClass = "w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500";
function importDate(value: string) {
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EmsEmployeesPage() {
  const { accessToken, user } = useAuthStore();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [pageInput, setPageInput] = useState('1');
  useEffect(() => {
    const timer = setTimeout(() => setFilters(previous => previous.search === search.trim() ? previous : { ...previous, search: search.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // The same filters drive the list and "invite all matching", so both always agree.
  const listFilters: EmployeeListFilters = {
    search: filters.search || undefined, sort: filters.sort,
    employmentStatus: filters.status && !filters.status.startsWith('INVITE:') && filters.status !== 'ACTIVE_GROUP' && filters.status !== 'INACTIVE_GROUP' ? filters.status as EmploymentStatus : undefined,
    activityState: filters.status === 'ACTIVE_GROUP' ? 'ACTIVE' : filters.status === 'INACTIVE_GROUP' ? 'INACTIVE' : undefined,
    invitation: filters.status.startsWith('INVITE:') ? filters.status.slice(7) as EmployeeInvitationFilter : undefined,
    source: filters.source === 'IMPORTED' || filters.source === 'UNLINKED' ? filters.source : undefined,
    importBatchId: filters.source.startsWith('batch:') ? filters.source.slice(6) : undefined,
  };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["ems-employees", user?.organizationId, filters],
    queryFn: () => EmsService.getEmployees(accessToken!, { ...listFilters, page: filters.page, limit: PAGE_SIZE }),
    enabled: !!accessToken,
  });
  // Selection: ticked people are kept across searches, filters and pages (id → name, for the summary).
  // "All matching" means everyone the current filters find, so it ends when the filters change.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [allMatching, setAllMatching] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  useEffect(() => { setAllMatching(false); }, [filters.search, filters.status, filters.source]);
  const sources = useQuery({
    queryKey: ['ems-employee-import-batches', user?.organizationId],
    queryFn: () => EmsService.getEmployeeImportBatches(accessToken!), enabled: !!accessToken,
  });
  const employees = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const pages = Math.max(1, data?.pagination.pages ?? 1);
  const page = data?.pagination.page ?? filters.page;
  const searching = search.trim() !== filters.search;
  const busy = isFetching || searching;
  useEffect(() => { setPageInput(String(page)); }, [page]);
  const changed = search.length > 0 || !!filters.status || !!filters.source || filters.sort !== 'BEST_MATCH';
  const update = (change: Partial<typeof filters>) => setFilters(previous => ({ ...previous, ...change, page: 1 }));
  const pageIds = employees.map(employee => employee.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const fullName = (employee: { firstName: string; middleName?: string | null; lastName: string }) =>
    [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ');
  const toggle = (employee: (typeof employees)[number]) => {
    setAllMatching(false);
    setSelected(previous => { const next = new Map(previous); if (next.has(employee.id)) next.delete(employee.id); else next.set(employee.id, fullName(employee)); return next; });
  };
  const togglePage = () => {
    setAllMatching(false);
    setSelected(previous => { const next = new Map(previous); employees.forEach(e => pageAllSelected ? next.delete(e.id) : next.set(e.id, fullName(e))); return next; });
  };
  // With "all matching", ticked people from other searches are still included; the preview shows the exact total.
  const selectionCount = allMatching ? total : selected.size;
  const selectedNames = [...selected.values()];
  // "Matching" only means something when a search or filter narrows the list.
  const narrowed = !!(filters.search || filters.status || filters.source);
  // Profiles' Previous / Next follow this exact list (same filters, sort and page).
  useEffect(() => {
    if (data) saveEmployeeNav({ filters: listFilters, page, limit: PAGE_SIZE, pages, total, ids: pageIds });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- saved whenever a page of results arrives
  }, [data]);
  const goToPage = () => {
    const requested = Number(pageInput);
    if (!Number.isInteger(requested) || requested < 1 || requested > pages) { setPageInput(String(page)); return; }
    setFilters(previous => ({ ...previous, page: requested }));
  };

  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/ems" aria-label="Back to EMS" className="text-slate-500 hover:text-purple-800"><ArrowLeft className="h-5 w-5" /></Link>
        <div><h1 className="text-2xl font-bold text-slate-900">Employees</h1><p className="text-sm text-slate-500">Profiles and completeness across your organisation</p></div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600">
            <span>Name or employee code</span>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" aria-label="Search all employees by name or code" maxLength={200} placeholder="Search all employees…" value={search}
                onChange={event => setSearch(event.target.value)} className={`${fieldClass} pl-9 font-normal`} />
            </div>
          </label>
          <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600"><span>Import source</span>
            <select aria-label="Import source filter" value={filters.source} onChange={event => update({source: event.target.value})} className={`${fieldClass} font-normal`}>
              <option value="">All sources</option><option value="IMPORTED">Imported employees</option><option value="UNLINKED">No linked import</option>
              {sources.data?.length ? <optgroup label="Specific import batch">{sources.data.map(batch => <option key={batch.id} value={`batch:${batch.id}`}>
                {batch.label?.trim() || batch.sourceFileName?.trim() || 'Unnamed import'} · {importDate(batch.importedAt)} · {batch.id.slice(0, 8)}
              </option>)}</optgroup> : null}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600"><span>Employment status</span>
            <select aria-label="Employment status filter" value={filters.status} onChange={event => update({status: event.target.value as StatusFilter})} className={`${fieldClass} font-normal`}>
              <option value="">All statuses</option><option value="ACTIVE_GROUP">Active (includes probation)</option><option value="INACTIVE_GROUP">Inactive (all reasons)</option>
              {(Object.entries(EMPLOYMENT_STATUS_LABELS) as [EmploymentStatus, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              <optgroup label="Account invitation">
                <option value="INVITE:NOT_INVITED">Not invited</option><option value="INVITE:PENDING">Invite pending</option>
                <option value="INVITE:ACCEPTED">Has access</option><option value="INVITE:ATTENTION">Invite needs attention</option>
              </optgroup>
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600"><span>Sort by</span>
            <select aria-label="Employee sort order" value={filters.sort} onChange={event => update({sort: event.target.value as EmployeeListSort})} className={`${fieldClass} font-normal`}>
              <option value="BEST_MATCH">{filters.search ? 'Best match' : 'Best match (A–Z without search)'}</option><option value="NAME_ASC">Name A–Z</option><option value="NAME_DESC">Name Z–A</option><option value="IMPORT_NEWEST">Import date: newest first</option><option value="IMPORT_OLDEST">Import date: oldest first</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>Search covers all pages.{filters.search && (filters.sort === 'BEST_MATCH' ? ' Exact matches first, then names or codes starting with your search, then other matches.' : ' Your selected sort overrides match priority; choose Best match for closest results.')}{filters.source === 'UNLINKED' && ' Includes older profiles with no recorded import.'}{filters.sort.startsWith('IMPORT_') && ' Employees without a linked import appear last.'}</p>
          {changed && <button type="button" onClick={() => {setSearch('');setFilters(initialFilters);setPageInput('1');}} className="rounded px-2 py-1 font-medium text-purple-800 hover:bg-purple-50">Clear filters</button>}
        </div>
        {sources.isLoading && <p className="text-xs text-slate-500">Loading import choices…</p>}
        {sources.error && <p role="alert" className="text-xs text-amber-800">Import choices could not load. <button className="underline" onClick={() => void sources.refetch()}>Retry import choices</button></p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-busy={busy}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 text-sm text-slate-600" role="status" aria-live="polite">
          <span>{isLoading || searching ? 'Finding employees…' : error ? 'Employees could not load' : total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} employees` : '0 employees'}</span>
          {busy && <Loader2 aria-label="Updating results" className="h-4 w-4 animate-spin text-purple-700" />}
        </div>
        {selectionCount > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-100 bg-purple-50/60 px-4 py-2 text-xs text-purple-950" role="status">
          <span>
            {allMatching ? `All ${total} employees${narrowed ? ' matching your search/filters' : ''} selected${selected.size ? ', plus anyone you ticked in other searches' : ''}.`
              : `${selected.size} selected: ${selectedNames.slice(0, 2).join(', ')}${selectedNames.length > 2 ? ` +${selectedNames.length - 2}` : ''}.`}
            {!allMatching && selected.size > pageIds.filter(id => selected.has(id)).length && <span className="text-purple-800"> Includes people from other searches.</span>}
            {!allMatching && pageAllSelected && total > pageIds.length && <> <button type="button" className="font-semibold underline" onClick={() => setAllMatching(true)}>Select all {total} employees{narrowed ? ' matching your search/filters' : ''}</button></>}
            {' '}<button type="button" className="text-purple-800 underline" onClick={() => { setSelected(new Map()); setAllMatching(false); }}>Clear</button>
          </span>
          <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700">
            <Send className="h-3.5 w-3.5" /> Send invitations
          </button>
        </div>}
        {isLoading ? <p className="py-12 text-center text-sm text-slate-500">Loading employees…</p> : error ?
          <div role="alert" className="px-5 py-6 text-sm text-red-700"><p>{error instanceof Error ? error.message : 'Could not load employees.'}</p><button onClick={() => void refetch()} className="mt-2 rounded border border-red-200 px-3 py-2 font-medium">Retry</button></div> :
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Employees matching the current search and filters</caption>
              <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500"><tr>
                <th scope="col" className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all employees on this page" checked={pageAllSelected} onChange={togglePage} /></th>
                {['Code', 'Name', 'Department', 'Status', 'Import source', 'Completion'].map(heading => <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{employees.map(employee => <tr key={employee.id} className="cursor-pointer align-top hover:bg-slate-50/70"
                // The whole row opens the profile for mouse users; the name link stays the keyboard and screen-reader route.
                onClick={event => { if ((event.target as HTMLElement).closest('a, button, input, select, textarea') || window.getSelection()?.toString()) return; router.push(`/ems/employees/${encodeURIComponent(employee.id)}`); }}>
                <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${[employee.firstName, employee.lastName].filter(Boolean).join(' ')}`}
                  checked={allMatching || selected.has(employee.id)} onChange={() => toggle(employee)} /></td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{employee.employeeCode ?? '—'}</td>
                <td className="min-w-40 px-4 py-3"><Link href={`/ems/employees/${encodeURIComponent(employee.id)}`} className="font-semibold text-purple-800 underline decoration-purple-200 underline-offset-2 hover:decoration-purple-800">{[employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ')}</Link></td>
                <td className="px-4 py-3 text-slate-600">{employee.department?.name ?? '—'}</td>
                <td className="px-4 py-3"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${employee.employmentStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : employee.employmentStatus === 'PROBATION' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}</span>
                  {(() => { const badge = invitationBadge(employee.invitation); return badge && <span className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.tone === 'warn' ? 'bg-amber-100 text-amber-900' : 'bg-blue-50 text-blue-800'}`}>{badge.label}</span>; })()}</td>
                <td className="min-w-48 max-w-xs px-4 py-3">{employee.sourceImport ? <>
                  <Link href={reviewRecordHref(employee.sourceImport.batchId, employee.sourceImport.recordId)} className="break-words text-xs font-medium text-purple-800 underline underline-offset-2">{employee.sourceImport.label?.trim() || employee.sourceImport.sourceFileName?.trim() || 'View import'}</Link>
                  <time dateTime={employee.sourceImport.importedAt} className="mt-1 block text-xs text-slate-500">Imported {importDate(employee.sourceImport.importedAt)}</time>
                </> : <span className="text-xs text-slate-500">{employee.sourceImport === null ? 'No linked import' : 'Source unavailable'}</span>}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${completionBg(employee.completion.overall)}`} style={{width: `${employee.completion.overall}%`}} /></div><span className="text-xs font-semibold text-slate-600">{employee.completion.overall}%</span></div></td>
              </tr>)}{!employees.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">No employees match these filters.</td></tr>}</tbody>
            </table>
          </div>}
        {!error && !isLoading && total > 0 && <nav aria-label="Employee pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <span>Page {page} of {pages}</span>
          <div className="flex flex-wrap items-center gap-2">
            <button aria-label="Previous employee page" disabled={page <= 1 || busy} onClick={() => setFilters(previous => ({...previous, page: page - 1}))} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
            <form onSubmit={event => {event.preventDefault();goToPage();}} className="flex items-center gap-1">
              <label htmlFor="employee-page">Go to page</label><input id="employee-page" type="number" min={1} max={pages} step={1} value={pageInput} onChange={event => setPageInput(event.target.value)} className="min-h-10 w-16 rounded-lg border border-slate-200 px-2" disabled={busy} /><button disabled={busy} className="min-h-10 rounded-lg px-2 font-semibold text-purple-800 disabled:opacity-40">Go</button>
            </form>
            <button aria-label="Next employee page" disabled={page >= pages || busy} onClick={() => setFilters(previous => ({...previous, page: page + 1}))} className="flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
          </div>
        </nav>}
      </div>
      {inviteOpen && accessToken && <InvitationDialog accessToken={accessToken}
        title={allMatching ? 'Invite selected employees' : `Invite ${selectionCount} employee${selectionCount === 1 ? '' : 's'}`}
        selection={allMatching ? { filters: listFilters, ...(selected.size ? { employeeIds: [...selected.keys()] } : {}) } : { employeeIds: [...selected.keys()] }}
        onClose={() => setInviteOpen(false)} />}
    </div>
  </ProtectedRoute>;
}
