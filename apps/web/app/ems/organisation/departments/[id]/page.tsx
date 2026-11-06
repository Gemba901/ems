"use client";

import { use, useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, X } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { EmsOrganisationService } from "@/services/ems-organisation.service";
import { BranchLabel, HodLine, IssueList, OrganisationHeader } from "@/components/ems/OrganisationParts";
import { personFullName } from "@/components/ems/person-name";
import { activeOnly, departmentIssues, hasSeveralBranches, initials } from "@/components/ems/department-directory";

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500";
const secondary = "inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

const STATUS_TONE: Record<string, string> = { ACTIVE: "bg-emerald-100 text-emerald-800", PROBATION: "bg-blue-100 text-blue-800" };
const statusLabel = (status: string) => status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");

export default function DepartmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}><Department id={id} /></ProtectedRoute>;
}

function Department({ id }: { id: string }) {
  const { accessToken, user } = useAuthStore();
  // The same data the list uses: one request for the whole structure, already cached when coming from the list.
  const directory = useQuery({ queryKey: ["ems-department-directory", user?.organizationId],
    queryFn: () => EmsOrganisationService.departments(accessToken!), enabled: !!accessToken });
  const all = directory.data?.departments ?? [];
  const department = all.find(d => d.id === id);
  const multi = hasSeveralBranches(all);
  const several = multi && (department?.branches.length ?? 0) > 1;
  // "Show them" (people without a manager) filters the people list and scrolls to it.
  const [noManager, setNoManager] = useState(false);
  const peopleRef = useRef<HTMLElement>(null);
  const showUnmanaged = () => { setNoManager(true); peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return <div className="mx-auto max-w-6xl space-y-5">
    <OrganisationHeader />
    <Link href="/ems/organisation" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-violet-700"><ArrowLeft size={15} /> Departments</Link>
    {directory.isPending ? <p role="status" className="text-sm text-slate-600">Loading department…</p>
      : directory.error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(directory.error as Error).message}</p>
      : !department ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">This department doesn’t exist in this company, or has been removed.</p>
      : <>
        {/* Name, branch(es) and totals together, always visible at the top. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{department.name}</h2>
            {multi && department.branches.length > 0 && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{department.branches.map(b => <BranchLabel key={b.key} label={b.label} />)}</div>}
          </div>
          <dl className="flex gap-2">
            {([["Active", activeOnly(department)], ["Probation", department.probation], ["Inactive", department.inactive]] as const).map(([label, value]) =>
              <div key={label} className="min-w-20 rounded-lg border border-slate-200 bg-white px-3 py-2"><dd className="text-lg font-bold text-slate-900">{value}</dd><dt className="text-xs text-slate-500">{label}</dt></div>)}
          </dl>
        </div>

        <div className={several ? "space-y-4" : "grid gap-4 lg:grid-cols-2"}>
          <section aria-labelledby="hods" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 id="hods" className="text-sm font-semibold text-slate-900">{several ? "Head of department, by branch" : "Head of department"}</h3>
            {!department.branches.length ? <p className="mt-2 text-sm text-slate-500">No people or HOD recorded yet.</p>
              : several ? <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {department.branches.map(b => <li key={b.key} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <BranchLabel label={b.label} className="mb-2" />
                  <HodLine hod={b.hod} />
                  <p className="mt-2 text-xs text-slate-500">{b.total} people · {activeOnly(b)} active · {b.probation} probation · {b.inactive} inactive</p>
                </li>)}
              </ul>
              : <div className="mt-3"><HodLine hod={department.branches[0].hod} /></div>}
          </section>

          <section aria-labelledby="attention" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 id="attention" className="text-sm font-semibold text-slate-900">Needs attention</h3>
            <div className="mt-3"><IssueList issues={departmentIssues(department, several)}
              action={issue => issue.kind === "NO_MANAGER" ? <button type="button" onClick={showUnmanaged} className="shrink-0 text-sm font-medium text-violet-800 hover:underline">Show them</button> : null} /></div>
          </section>
        </div>

        {accessToken && <People ref={peopleRef} key={`${user?.organizationId}:${department.id}`} id={department.id} total={department.total} token={accessToken} company={user?.organizationId}
          branches={several ? department.branches.map(b => [b.key, b.label] as [string, string]) : []} noManager={noManager} setNoManager={setNoManager} />}
      </>}
  </div>;
}

function People({ ref, id, total, token, company, branches, noManager, setNoManager }: {
  ref: Ref<HTMLElement>; id: string; total: number; token: string; company?: string | null; branches: [string, string][];
  noManager: boolean; setNoManager: (value: boolean) => void;
}) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(""), [term, setTerm] = useState("");
  const [activity, setActivity] = useState(""), [branch, setBranch] = useState<string | null>(null);
  // Opened from a branch (e.g. the HODs view): start on that branch, once.
  const startedOnBranch = useRef(false);
  useEffect(() => {
    if (startedOnBranch.current) return;
    startedOnBranch.current = true;
    const wanted = new URLSearchParams(window.location.search).get("branch");
    if (wanted && branches.some(([key]) => key === wanted)) setBranch(wanted);
  }, [branches]);
  useEffect(() => { const timer = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [noManager]);
  const people = useQuery({ queryKey: ["ems-department-people", company, id, branch, page, term, activity, noManager],
    queryFn: () => EmsOrganisationService.people(id, { page, search: term, branch, activity, noManager }, token) });
  const pages = Math.max(1, people.data?.pagination.pages ?? 1);
  const chip = (value: string, label: string) => <button key={value} type="button" aria-pressed={activity === value} onClick={() => { setActivity(value); setPage(1); }}
    className={`min-h-9 rounded-full border px-3 py-1 text-sm ${activity === value ? "border-violet-700 bg-violet-50 font-semibold text-violet-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>{label}</button>;

  return <section ref={ref} aria-labelledby="people" className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4">
    <h3 id="people" className="text-sm font-semibold text-slate-900">People ({total})</h3>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-52 flex-1 text-xs font-medium text-slate-600">Find a person
        <span className="relative mt-1 block"><Search size={16} aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, code or job title" className={`${field} w-full pl-9`} /></span>
      </label>
      {branches.length > 1 && <label className="text-xs font-medium text-slate-600">Branch
        <select value={branch ?? ""} onChange={e => { setBranch(e.target.value || null); setPage(1); }} className={`${field} mt-1 block min-w-40`}>
          <option value="">All branches</option>{branches.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>}
      <div role="group" aria-label="Employment" className="flex flex-wrap gap-1.5">
        {chip("", "All")}{chip("ACTIVE", "Active & probation")}{chip("PROBATION", "Probation")}{chip("INACTIVE", "Inactive")}
      </div>
    </div>
    {noManager && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">
      Showing people with no manager
      <button type="button" onClick={() => setNoManager(false)} aria-label="Show everyone again" className="rounded-full p-0.5 hover:bg-amber-200"><X className="h-3.5 w-3.5" /></button>
    </p>}
    {people.isPending ? <p role="status" className="mt-4 text-sm text-slate-600">Loading people…</p>
      : people.error ? <p role="alert" className="mt-4 text-sm text-red-700">{(people.error as Error).message}</p>
      : !people.data?.data.length ? <p className="mt-4 text-sm text-slate-500">No people match this selection.</p>
      : <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="py-2 pr-4 font-semibold">Name</th><th className="py-2 pr-4 font-semibold">Code</th><th className="py-2 pr-4 font-semibold">Job title</th>
              {branches.length > 1 && <th className="py-2 pr-4 font-semibold">Branch</th>}<th className="py-2 font-semibold">Status</th></tr>
          </thead>
          <tbody>
            {people.data.data.map(person => { const name = personFullName(person); return <tr key={person.id} className="border-t border-slate-100">
              <td className="py-2.5 pr-4"><div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-700">{initials(name)}</span>
                <Link href={`/ems/employees/${encodeURIComponent(person.id)}`} className="font-medium text-violet-800 hover:underline">{name}</Link>
              </div></td>
              <td className="py-2.5 pr-4 text-slate-700">{person.employeeCode ?? "—"}</td>
              <td className="py-2.5 pr-4 text-slate-700">{person.jobTitle ?? "—"}</td>
              {branches.length > 1 && <td className="py-2.5 pr-4 text-slate-700">{person.plantBranch ?? "—"}</td>}
              <td className="py-2.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[person.employmentStatus] ?? "bg-slate-100 text-slate-700"}`}>{statusLabel(person.employmentStatus)}</span></td>
            </tr>; })}
          </tbody>
        </table>
      </div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>{people.data?.pagination.total ?? 0} people · Page {page} of {pages}</span>
      <div className="flex gap-2">
        <button type="button" className={secondary} disabled={page <= 1 || people.isFetching} onClick={() => setPage(p => p - 1)}>Previous</button>
        <button type="button" className={secondary} disabled={page >= pages || people.isFetching} onClick={() => setPage(p => p + 1)}>Next</button>
      </div>
    </div>
  </section>;
}
