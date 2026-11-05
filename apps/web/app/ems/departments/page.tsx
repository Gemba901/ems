"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, RefreshCw, Search, Users } from 'lucide-react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuthStore } from '@/store/auth.store';
import { Role } from '@/types/role';
import { EmsOrganisationService } from '@/services/ems-organisation.service';
import { filterDepartments, HOD_STATE_LABEL, type DepartmentHod } from '@/components/ems/department-directory';

const field = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export default function DepartmentsPage() {
  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}><DepartmentDirectory /></ProtectedRoute>;
}
function Hod({ value }: { value: DepartmentHod }) {
  const person = value.person;
  return <div className="min-w-0 text-sm">
    <p className={value.state === 'ASSIGNED' ? 'text-emerald-700' : 'text-amber-800'}>{HOD_STATE_LABEL[value.state]}</p>
    {person && <>
      {person.id ? <Link className="font-medium text-violet-700 underline-offset-2 hover:underline" href={`/ems/employees/${encodeURIComponent(person.id)}`}>{person.name}</Link> : <p className="font-medium text-slate-800">{person.name}</p>}
      <p className="text-xs text-slate-500">{[person.jobTitle, person.employeeCode].filter(Boolean).join(' · ')}</p>
    </>}
  </div>;
}
function DepartmentDirectory() {
  const { accessToken, user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; name: string; branch: string | null } | null>(null);
  const directory = useQuery({ queryKey: ['ems-department-directory', user?.organizationId],
    queryFn: () => EmsOrganisationService.departments(accessToken!), enabled: !!accessToken });
  const data = directory.data;
  const branches = new Map<string, string>();
  data?.departments.forEach(d => d.branches.forEach(b => { if (!branches.has(b.key)) branches.set(b.key, b.label); }));
  const rows = filterDepartments(data?.departments ?? [], search, branch);
  // Organisation changes must not keep a person selection from the previous company.
  useEffect(() => { setSelection(null); setBranch(null); setSearch(''); }, [user?.organizationId]);
  const refresh = () => { void directory.refetch(); };
  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link href="/ems/employees" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-violet-700"><ArrowLeft size={15} /> Employees</Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Building2 className="text-violet-700" /> Departments</h1>
        <p className="mt-1 text-sm text-slate-600">Company-wide departments, recorded branches and people.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={secondary} onClick={refresh} disabled={directory.isFetching}><RefreshCw size={15} className={directory.isFetching ? 'animate-spin' : ''} /> Refresh</button>
        {(user?.roleLevel === Role.ADMIN || user?.roleLevel === Role.SUPER_ADMIN) && <Link href="/ems/onboarding/departments" className={secondary}>Set up departments</Link>}
      </div>
    </header>
    {directory.isPending ? <p role="status" className="text-sm text-slate-600">Loading departments…</p> : directory.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(directory.error as Error).message}</p> : data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Departments', data.departments.length], ['Active / probation', data.counts.active], ['Inactive', data.counts.inactive], ['Department missing or unavailable', data.counts.unassigned]].map(([label, count]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-900">{count}</p></div>)}
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex-1 text-xs font-medium text-slate-600">Find a department<div className="relative mt-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} className={`${field} w-full pl-9`} placeholder="Department name" /></div></label>
        <label className="text-xs font-medium text-slate-600">Recorded branch<select value={branch === null ? '__ALL__' : `branch:${branch}`} onChange={e => setBranch(e.target.value === '__ALL__' ? null : e.target.value.slice(7))} className={`${field} mt-1 block min-w-44`}><option value="__ALL__">All branches</option>{[...branches].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) => <option value={`branch:${key}`} key={key}>{label}</option>)}</select></label>
        {(search || branch !== null) && <button className={secondary} onClick={() => { setSearch(''); setBranch(null); }}>Clear filters</button>}
      </div>
      <p className="text-xs text-slate-500">Source: {data.source} · Loaded {new Date(data.asOf).toLocaleString()} · Active includes probation. Branch groups reflect current employee and confirmed HOD records.</p>
      {!rows.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">{data.departments.length ? 'No departments match these filters.' : 'No departments have been set up yet. An administrator can add them through department setup.'}</div> : <div className="space-y-3">{rows.map(row => <section key={row.id} aria-labelledby={`department-${row.id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
          <div><h2 id={`department-${row.id}`} className="font-semibold text-slate-900">{row.name}</h2><p className="text-xs text-slate-500">{row.total} people · {row.active} active / probation · {row.inactive} inactive{branch !== null ? ' · selected branch' : ''}</p></div>
          <button className={secondary} onClick={() => setSelection({ id: row.id, name: row.name, branch })}><Users size={15} /> View people</button>
        </div>
        {row.branches.length ? <ul className="divide-y divide-slate-100">{row.branches.map(b => <li key={b.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <div><p className="text-sm font-medium text-slate-800">{b.label}</p><p className="text-xs text-slate-500">{b.total} people · {b.active} active / probation · {b.inactive} inactive</p></div>
          <Hod value={b.hod} />
          <button className="text-left text-sm font-medium text-violet-700 hover:underline" onClick={() => setSelection({ id: row.id, name: row.name, branch: b.key })}>View branch people</button>
        </li>)}</ul> : <p className="p-4 text-sm text-slate-500">No employees or branch HOD assignments recorded.</p>}
      </section>)}</div>}
    </>}
    {selection && accessToken && <PeoplePanel key={`${user?.organizationId}:${selection.id}:${selection.branch}`} selection={selection} token={accessToken} company={user?.organizationId} onClose={() => setSelection(null)} />}
  </div>;
}
function PeoplePanel({ selection, token, company, onClose }: { selection: { id: string; name: string; branch: string | null }; token: string; company?: string | null; onClose: () => void }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [activity, setActivity] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const people = useQuery({ queryKey: ['ems-department-people', company, selection.id, selection.branch, page, term, activity],
    queryFn: () => EmsOrganisationService.people(selection.id, { page, search: term, branch: selection.branch, activity }, token) });
  // A regular section keeps keyboard navigation straightforward; bring it into view after selection.
  useEffect(() => { document.getElementById('department-people-heading')?.focus(); }, []);
  return <section className="rounded-xl border-2 border-violet-200 bg-white p-4" aria-labelledby="department-people-heading">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 id="department-people-heading" tabIndex={-1} className="text-lg font-semibold text-slate-900 outline-none">People · {selection.name}</h2><p className="text-xs text-slate-500">{selection.branch === null ? 'All branches' : 'Selected branch'} · Open a profile to review reporting or edit an individual department assignment.</p></div><button className={secondary} onClick={onClose}>Close</button></div>
    <div className="mb-4 flex flex-wrap gap-3"><label className="text-xs text-slate-600">Find a person<input className={`${field} mt-1 block`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, code or job title" /></label><label className="text-xs text-slate-600">Employment<select className={`${field} mt-1 block`} value={activity} onChange={e => { setActivity(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="ACTIVE">Active / probation</option><option value="INACTIVE">Inactive</option></select></label></div>
    {people.isPending ? <p role="status">Loading people…</p> : people.error ? <p role="alert" className="text-sm text-red-700">{(people.error as Error).message}</p> : <>
      {!people.data?.data.length ? <p className="py-4 text-sm text-slate-500">No people match this selection.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="py-2 pr-4">Employee</th><th className="pr-4">Job title</th><th className="pr-4">Branch</th><th>Status</th></tr></thead><tbody className="divide-y divide-slate-100">{people.data.data.map(person => <tr key={person.id}><td className="py-3 pr-4"><Link className="font-medium text-violet-700 hover:underline" href={`/ems/employees/${encodeURIComponent(person.id)}`}>{[person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ')}</Link><p className="text-xs text-slate-500">{person.employeeCode || 'No employee code'}</p></td><td className="pr-4">{person.jobTitle || 'Not recorded'}</td><td className="pr-4">{person.plantBranch || 'Not recorded'}</td><td>{person.employmentStatus.replaceAll('_', ' ')}</td></tr>)}</tbody></table></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>{people.data?.pagination.total ?? 0} people · Page {page} of {Math.max(1, people.data?.pagination.pages ?? 1)}</span><div className="flex gap-2"><button className={secondary} disabled={page <= 1 || people.isFetching} onClick={() => setPage(p => p - 1)}>Previous</button><button className={secondary} disabled={page >= (people.data?.pagination.pages ?? 0) || people.isFetching} onClick={() => setPage(p => p + 1)}>Next</button></div></div>
    </>}
  </section>;
}
