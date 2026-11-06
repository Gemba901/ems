"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { EmsOrganisationService } from "@/services/ems-organisation.service";
import { BranchLabel, HodLine, IssueList, OrganisationHeader, Pill } from "@/components/ems/OrganisationParts";
import {
  activeOnly, departmentIssues, departmentMatches, departmentSummary, filterDepartments, groupByBranch, hasSeveralBranches, hodColumn, hodRows,
  initials, sortDepartments, type DepartmentBranch, type DepartmentDirectoryRow, type DepartmentFilter, type DepartmentSort,
} from "@/components/ems/department-directory";

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const SETUP = "/ems/onboarding/departments?returnTo=%2Fems%2Forganisation";
const departmentHref = (id: string, branch?: string) => `/ems/organisation/departments/${encodeURIComponent(id)}${branch ? `?branch=${encodeURIComponent(branch)}` : ""}`;

type View = "DEPARTMENTS" | "BRANCHES" | "HODS";

export default function OrganisationPage() {
  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}><Departments /></ProtectedRoute>;
}

/** "57 · 52 active · 4 probation · 1 inactive" for a department or branch. */
function Counts({ value }: { value: { total: number; active: number; probation: number; inactive: number } }) {
  return <div>
    <p className="font-semibold text-slate-900">{value.total}</p>
    <p className="text-xs text-slate-500">{activeOnly(value)} active · {value.probation} probation · {value.inactive} inactive</p>
  </div>;
}

/** A segmented switch (Departments | Branches | HODs, Cards | Table). */
function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <div role="group" aria-label={label} className="flex overflow-hidden rounded-lg border border-slate-300">
    {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
      className={`min-h-10 px-3 text-sm ${value === key ? "bg-violet-700 font-semibold text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{text}</button>)}
  </div>;
}

function Departments() {
  const { accessToken, user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const [filter, setFilter] = useState<DepartmentFilter>("ALL");
  const [sort, setSort] = useState<DepartmentSort>("NAME");
  const [view, setView] = useState<View>("DEPARTMENTS");
  // Another company's choices must never carry over.
  useEffect(() => { setSearch(""); setBranch(null); setFilter("ALL"); setView("DEPARTMENTS"); }, [user?.organizationId]);

  const directory = useQuery({ queryKey: ["ems-department-directory", user?.organizationId],
    queryFn: () => EmsOrganisationService.departments(accessToken!), enabled: !!accessToken });
  const data = directory.data;
  const all = useMemo(() => data?.departments ?? [], [data]);
  const multi = hasSeveralBranches(all);
  const branches = useMemo(() => {
    const seen = new Map<string, string>();
    all.forEach(d => d.branches.forEach(b => { if (!seen.has(b.key)) seen.set(b.key, b.label); }));
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const scoped = filterDepartments(all, search, multi ? branch : null);
  const summary = departmentSummary(scoped, multi);
  const rows = sortDepartments(scoped.filter(row => departmentMatches(row, filter, multi)), sort, multi);
  const isAdmin = user?.roleLevel === Role.ADMIN || user?.roleLevel === Role.SUPER_ADMIN;
  const activeView: View = view === "BRANCHES" && !multi ? "DEPARTMENTS" : view;

  const chip = (id: DepartmentFilter, label: string) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
    className={`min-h-9 rounded-full border px-3.5 py-1.5 text-sm ${filter === id ? "border-violet-700 bg-violet-50 font-semibold text-violet-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <OrganisationHeader actions={<>
      <button type="button" className={secondary} onClick={() => void directory.refetch()} disabled={directory.isFetching}>
        <RefreshCw size={15} className={directory.isFetching ? "animate-spin" : ""} /> Refresh</button>
      {isAdmin && <Link href={SETUP} className={secondary}>Set up departments</Link>}
    </>} />

    {directory.isPending ? <p role="status" className="text-sm text-slate-600">Loading departments…</p>
      : directory.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(directory.error as Error).message}</p>
      : data && <>
        <div className="flex flex-wrap items-center gap-2">
          {chip("ALL", `${summary.all} ${summary.all === 1 ? "department" : "departments"}`)}
          {chip("NO_HOD", `${summary.noHod} without HOD`)}
          {chip("ATTENTION", `${summary.attention} need attention`)}
          {chip("EMPTY", `${summary.empty} empty`)}
        </div>
        <p className="text-sm text-slate-600">
          {data.counts.total} people · {activeOnly(data.counts)} active · {data.counts.probation} probation · {data.counts.inactive} inactive
          {data.counts.unassigned > 0 && <> · <span className="font-medium text-amber-800">{data.counts.unassigned} with no department</span></>}
        </p>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">Find a department
            <span className="relative mt-1 block"><Search size={16} aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400" />
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Department name" className={`${field} w-full pl-9`} /></span>
          </label>
          {multi && <label className="text-xs font-medium text-slate-600">Branch
            <select value={branch ?? ""} onChange={e => setBranch(e.target.value || null)} className={`${field} mt-1 block min-w-44`}>
              <option value="">All branches</option>
              {branches.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>}
          {activeView === "DEPARTMENTS" && <label className="text-xs font-medium text-slate-600">Sort
            <select value={sort} onChange={e => setSort(e.target.value as DepartmentSort)} className={`${field} mt-1 block`}>
              <option value="NAME">Name A–Z</option><option value="PEOPLE">Most people</option><option value="ISSUES">Most issues</option>
            </select></label>}
          <div className="text-xs font-medium text-slate-600">View
            <div className="mt-1"><Segments label="View" value={activeView} onChange={setView}
              options={multi ? [["DEPARTMENTS", "Departments"], ["BRANCHES", "Branches"], ["HODS", "HODs"]] : [["DEPARTMENTS", "Departments"], ["HODS", "HODs"]]} /></div>
          </div>
        </div>

        {!rows.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {all.length ? "No departments match these filters." : "No departments have been set up yet."}</div>
          : activeView === "HODS" ? <Hods rows={rows} multi={multi} isAdmin={isAdmin} />
          : activeView === "BRANCHES" ? <ByBranch rows={rows} />
          : <ByDepartment rows={rows} multi={multi} />}

        <p className="text-xs text-slate-500">Source: {data.source} · Loaded {new Date(data.asOf).toLocaleString()}.</p>
      </>}
  </div>;
}

/** The HOD column of a department row: branches with a HOD listed, branches without one summarised in a single line. */
function HodCell({ row, multi }: { row: DepartmentDirectoryRow; multi: boolean }) {
  const { shown, missingText, missingAll } = hodColumn(row);
  if (!row.branches.length) return <span className="text-xs text-slate-500">—</span>;
  return <div className="space-y-2.5">
    {shown.map(b => <div key={b.key} className="min-w-0">
      {multi && <BranchLabel label={b.label} className="mb-1" />}
      <HodLine hod={b.hod} compact />
    </div>)}
    {missingText && (shown.length || multi
      ? <p className="text-xs font-medium text-amber-800" title={missingAll}>{missingText}</p>
      : <Pill>No HOD</Pill>)}
  </div>;
}

/** Default view: one row per department. The header row stays visible while scrolling. */
function ByDepartment({ rows, multi }: { rows: DepartmentDirectoryRow[]; multi: boolean }) {
  const th = "sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold";
  return <>
    <p className="hidden text-xs text-slate-500 md:block">Needs attention lists what’s missing: a branch with no HOD, a HOD who isn’t registered yet, or active staff with no manager. Use ⓘ for details.</p>
    <div className="hidden overflow-clip rounded-xl border border-slate-200 bg-white md:block">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr><th className={th}>Department</th><th className={th}>{multi ? "Branch · HOD" : "HOD"}</th>
            <th className={th}>People</th><th className={th}>Needs attention</th></tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.id} className="border-t border-slate-100 align-top">
            <td className="px-4 py-3.5"><Link href={departmentHref(row.id)} className="font-semibold text-violet-800 hover:underline">{row.name}</Link></td>
            <td className="px-4 py-3.5"><HodCell row={row} multi={multi} /></td>
            <td className="px-4 py-3.5"><Counts value={row} /></td>
            <td className="px-4 py-3.5"><IssueList issues={departmentIssues(row, multi)} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    <ul className="space-y-3 md:hidden">
      {rows.map(row => <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between gap-2">
          <Link href={departmentHref(row.id)} className="font-semibold text-violet-800 hover:underline">{row.name}</Link>
          <span className="shrink-0 text-sm text-slate-600">{row.total} people</span>
        </div>
        <div className="mt-3"><HodCell row={row} multi={multi} /></div>
        <div className="mt-3 border-t border-slate-100 pt-3"><IssueList issues={departmentIssues(row, multi)} /></div>
      </li>)}
    </ul>
  </>;
}

/** "Branches": each branch as a clear band, its departments and that branch's HOD underneath. */
function ByBranch({ rows }: { rows: DepartmentDirectoryRow[] }) {
  return <div className="space-y-6">
    {groupByBranch(rows).map(group => <section key={group.key} aria-labelledby={`branch-${group.key}`} className="overflow-clip rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-violet-100 border-l-4 border-l-violet-600 bg-violet-50 px-4 py-3">
        <h2 id={`branch-${group.key}`}><BranchLabel label={group.label} className="text-base" /></h2>
        <p className="text-xs text-slate-600">{group.entries.length} {group.entries.length === 1 ? "department" : "departments"} · {group.total} people</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {group.entries.map(({ department, branch }) => <li key={department.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
          <Link href={departmentHref(department.id, branch.key)} className="font-medium text-violet-800 hover:underline">{department.name}</Link>
          <div><HodLine hod={branch.hod} compact /></div>
          <Counts value={branch} />
        </li>)}
      </ul>
    </section>)}
  </div>;
}

/** "HODs": who leads what. Cards grouped by branch (default) or a table; "Missing only"; an Edit HODs switch for Admins. */
function Hods({ rows, multi, isAdmin }: { rows: DepartmentDirectoryRow[]; multi: boolean; isAdmin: boolean }) {
  const [layout, setLayout] = useState<"CARDS" | "TABLE">("CARDS");
  const [missingOnly, setMissingOnly] = useState(false);
  const [editing, setEditing] = useState(false);
  const entries = hodRows(rows, missingOnly);
  const missing = hodRows(rows, true).length;
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; entries: { department: DepartmentDirectoryRow; branch: DepartmentBranch }[] }>();
    for (const entry of entries) {
      const key = multi ? entry.branch.key : "all";
      if (!map.has(key)) map.set(key, { key, label: entry.branch.label, entries: [] });
      map.get(key)!.entries.push(entry);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [entries, multi]);

  return <div className="space-y-4">
    {/* Stays at the top while scrolling, so switching and editing are always within reach. */}
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
      <Segments label="Layout" value={layout} onChange={setLayout} options={[["CARDS", "Cards"], ["TABLE", "Table"]]} />
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={missingOnly} onChange={e => setMissingOnly(e.target.checked)} className="h-4 w-4 accent-violet-700" />
        Missing only <span className="text-slate-500">({missing})</span>
      </label>
      {isAdmin && <label className="ml-auto flex min-h-10 items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" role="switch" aria-checked={editing} checked={editing} onChange={e => setEditing(e.target.checked)} className="h-4 w-4 accent-violet-700" />
        Edit HODs
      </label>}
    </div>

    {!entries.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Every department has a HOD here.</p>
      : layout === "CARDS" ? <div className="space-y-6">
        {groups.map(group => <section key={group.key} aria-labelledby={`hods-${group.key}`}>
          {multi && <div className="mb-3 rounded-lg border-l-4 border-l-violet-600 bg-violet-50 px-4 py-2.5"><h2 id={`hods-${group.key}`}><BranchLabel label={group.label} className="text-base" /></h2></div>}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.entries.map(({ department, branch }) => <HodCard key={`${department.id}:${branch.key}`} department={department} branch={branch} editing={editing} isAdmin={isAdmin} />)}
          </ul>
        </section>)}
      </div>
      : <div className="overflow-clip rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Department", ...(multi ? ["Branch"] : []), "HOD", "State", "People"].map(h => <th key={h} className="sticky top-0 z-10 bg-slate-50 px-4 py-3 font-semibold">{h}</th>)}
              {editing && <th className="sticky top-0 z-10 bg-slate-50 px-4 py-3"><span className="sr-only">Change</span></th>}</tr>
          </thead>
          <tbody>
            {entries.map(({ department, branch }) => <tr key={`${department.id}:${branch.key}`} className="border-t border-slate-100">
              <td className="px-4 py-3"><Link href={departmentHref(department.id, branch.key)} className="font-medium text-violet-800 hover:underline">{department.name}</Link></td>
              {multi && <td className="px-4 py-3 text-slate-700">{branch.label}</td>}
              <td className="px-4 py-3">{branch.hod.person ? <HodLine hod={{ ...branch.hod, state: "ASSIGNED" }} compact /> : <span className="text-slate-500">—</span>}</td>
              <td className="px-4 py-3">{branch.hod.state === "ASSIGNED" ? <span className="text-xs font-semibold text-emerald-700">Confirmed</span> : <HodLine hod={{ ...branch.hod, person: null }} />}</td>
              <td className="px-4 py-3"><Link href={departmentHref(department.id, branch.key)} className="text-violet-800 hover:underline">{branch.total}</Link></td>
              {editing && <td className="px-4 py-3"><Link href={SETUP} className="text-sm font-medium text-violet-800 hover:underline">{branch.hod.state === "NOT_RECORDED" ? "Choose HOD" : "Change"}</Link></td>}
            </tr>)}
          </tbody>
        </table></div>
      </div>}
  </div>;
}

/** One HOD card: department as the heading; photo (initials for now), name, position, code, state, people. Missing HODs are faded. */
function HodCard({ department, branch, editing, isAdmin }: { department: DepartmentDirectoryRow; branch: DepartmentBranch; editing: boolean; isAdmin: boolean }) {
  const person = branch.hod.person, missing = branch.hod.state === "NOT_RECORDED";
  return <li className={`flex flex-col gap-3 rounded-xl border p-4 ${missing ? "border-dashed border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
    <Link href={departmentHref(department.id, branch.key)} className="font-semibold text-slate-900 hover:text-violet-800 hover:underline">{department.name}</Link>
    {person ? <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-800">{initials(person.name)}</span>
      <div className="min-w-0">
        {person.id ? <Link href={`/ems/employees/${encodeURIComponent(person.id)}`} className="block truncate font-medium text-violet-800 hover:underline">{person.name}</Link>
          : <p className="truncate font-medium text-slate-800">{person.name}</p>}
        <p className="truncate text-sm text-slate-600">{person.jobTitle ?? "—"}</p>
        <p className="text-xs text-slate-500">{person.employeeCode ? `Code ${person.employeeCode}` : "No code"}</p>
      </div>
    </div> : <p className="text-sm font-medium text-amber-900">{branch.hod.state === "UNASSIGNED" ? "No HOD (by choice)" : "No HOD"}</p>}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
      <Link href={departmentHref(department.id, branch.key)} className="text-violet-800 hover:underline">{branch.total} {branch.total === 1 ? "person" : "people"}</Link>
      {person && branch.hod.state !== "ASSIGNED" && <HodLine hod={{ ...branch.hod, person: null }} />}
      {isAdmin && (missing || editing) && <Link href={SETUP} className="text-sm font-medium text-violet-800 hover:underline">{missing ? "Choose HOD" : "Change"}</Link>}
    </div>
  </li>;
}
