"use client";

import { use, useEffect, useMemo, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, X } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { EmsOrganisationService } from "@/services/ems-organisation.service";
import { BranchLabel, branchShade, HodLine, IssueList, OrganisationHeader } from "@/components/ems/OrganisationParts";
import { DepartmentHodDialog } from "@/components/ems/DepartmentHodDialog";
import { personFullName } from "@/components/ems/person-name";
import { activeOnly, departmentIssues, departmentsBackHref, hasSeveralBranches, initials } from "@/components/ems/department-directory";
import { coloursForGroups } from "@/components/ems/branch-colours";
import { isOrgChartAddress } from "@/components/ems/organisation-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table } from "@/components/ui/table";

const field = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
/** Every box on the page: an edge that stands off the grey background (darker outline + a light shadow). */
const box = "border border-border bg-card shadow-sm";
const linkButton = "text-sm font-medium text-primary hover:underline";
const secondary = "inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";

const STATUS_TONE: Record<string, string> = { ACTIVE: "bg-success-subtle text-success", PROBATION: "bg-info-subtle text-info" };
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
  // The same branch colours as the Departments page and the org chart (ranked across the whole company).
  const colours = useMemo(() => coloursForGroups((directory.data?.branches ?? []).map(b => ({ id: b.key, name: b.label, people: b.total, activePeople: b.active }))), [directory.data]);
  // "Show them" (people without a manager) filters the people list and scrolls to it.
  const [noManager, setNoManager] = useState(false);
  const peopleRef = useRef<HTMLElement>(null);
  const showUnmanaged = () => { setNoManager(true); peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // Back returns to the Departments view you came from (its address arrives as ?from=…; anything else goes to the plain list).
  const [back, setBack] = useState("/ems/organisation");
  useEffect(() => { setBack(departmentsBackHref(new URLSearchParams(window.location.search).get("from"))); }, []);
  // Choose HOD / Change, here as on the Departments page: Super Admin, Admin and HR.
  const canChoose = user?.roleLevel === Role.ADMIN || user?.roleLevel === Role.SUPER_ADMIN || user?.roleLevel === Role.HR;
  const [choosing, setChoosing] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null);
  const choose = (branchKey: string) => { setFeedback(null); setChoosing(branchKey); };
  const shade = (key: string) => branchShade(colours, key);
  const chooseLink = (hod: { state: string }, branchKey: string) => canChoose
    ? <Button variant="ghost" type="button" className={`${linkButton} h-auto whitespace-normal`} onClick={() => choose(branchKey)}>{hod.state === "NOT_RECORDED" ? "Choose HOD" : "Change"}</Button> : null;

  return <div className="mx-auto max-w-6xl space-y-5">
    <OrganisationHeader />
    <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={15} /> {isOrgChartAddress(back) ? "Back to org chart" : "Departments"}</Link>
    {feedback && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">{feedback}</p>}
    {directory.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading department…</p>
      : directory.error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">{(directory.error as Error).message}</p>
      : !department ? <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">This department doesn’t exist in this company, or has been removed.</p>
      : <>
        {/* Name, branch(es) and totals together, always visible at the top. */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">{department.name}</h2>
            {multi && department.branches.length > 0 && <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{department.branches.map(b => <BranchLabel key={b.key} label={b.label} colour={shade(b.key)} />)}</div>}
          </div>
          <dl className="flex gap-2">
            {([["Active", activeOnly(department)], ["Probation", department.probation], ["Inactive", department.inactive]] as const).map(([label, value]) =>
              <div key={label} className={`min-w-20 rounded-lg px-3 py-2 ${box}`}><dd className="text-lg font-bold text-foreground">{value}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>)}
          </dl>
        </div>

        <div className={several ? "space-y-4" : "grid gap-4 lg:grid-cols-2"}>
          <section aria-labelledby="hods" className={`rounded-xl p-4 ${box}`}>
            <h3 id="hods" className="text-sm font-semibold text-foreground">{several ? "Head of department, by branch" : "Head of department"}</h3>
            {!department.branches.length ? <p className="mt-2 text-sm text-muted-foreground">No people or HOD recorded yet.</p>
              : several ? <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {department.branches.map(b => <li key={b.key} className="flex flex-col rounded-lg border-2 bg-card p-3" style={{ borderColor: shade(b.key) }}>
                  <BranchLabel label={b.label} colour={shade(b.key)} className="mb-2" />
                  <HodLine hod={b.hod} />
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
                    <p className="text-xs text-muted-foreground">{b.total} people · {activeOnly(b)} active · {b.probation} probation · {b.inactive} inactive</p>
                    {chooseLink(b.hod, b.key)}
                  </div>
                </li>)}
              </ul>
              : <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><HodLine hod={department.branches[0].hod} />{chooseLink(department.branches[0].hod, department.branches[0].key)}</div>}
          </section>

          <section aria-labelledby="attention" className={`rounded-xl p-4 ${box}`}>
            <h3 id="attention" className="text-sm font-semibold text-foreground">Needs attention</h3>
            <div className="mt-3"><IssueList issues={departmentIssues(department, several)} onBranch={canChoose ? (_, key) => choose(key) : undefined}
              action={issue => issue.kind === "NO_MANAGER" ? <Button variant="ghost" type="button" onClick={showUnmanaged} className="shrink-0 text-sm font-medium text-primary hover:underline h-auto whitespace-normal">Show them</Button> : null} /></div>
          </section>
        </div>

        {accessToken && <People ref={peopleRef} key={`${user?.organizationId}:${department.id}`} id={department.id} total={department.total} token={accessToken} company={user?.organizationId}
          branches={several ? department.branches.map(b => [b.key, b.label] as [string, string]) : []} noManager={noManager} setNoManager={setNoManager} />}
        {choosing !== null && accessToken && <DepartmentHodDialog key={`${department.id}:${choosing}`} department={department} branches={department.branches}
          initialBranch={choosing} company={user?.organizationId} token={accessToken} onClose={() => setChoosing(null)} onSaved={setFeedback} />}
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
  const chip = (value: string, label: string) => <Button variant="ghost" key={value} type="button" aria-pressed={activity === value} onClick={() => { setActivity(value); setPage(1); }}
    className={`whitespace-normal min-h-9 rounded-full border px-3 py-1 text-sm ${activity === value ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}>{label}</Button>;

  return <section ref={ref} aria-labelledby="people" className={`scroll-mt-20 rounded-xl p-4 ${box}`}>
    <h3 id="people" className="text-sm font-semibold text-foreground">People ({total})</h3>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="min-w-52 flex-1 text-xs font-medium text-muted-foreground">Find a person
        <span className="relative mt-1 block"><Search size={16} aria-hidden="true" className="absolute left-3 top-2.5 text-muted-foreground" />
          <Input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, code or job title" className={`${field} w-full pl-9`} /></span>
      </label>
      {branches.length > 1 && <label className="text-xs font-medium text-muted-foreground">Branch
        <NativeSelect value={branch ?? ""} onChange={e => { setBranch(e.target.value || null); setPage(1); }} className={`${field} mt-1 block min-w-40`}>
          <option value="">All branches</option>{branches.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </NativeSelect></label>}
      <div role="group" aria-label="Employment" className="flex flex-wrap gap-1.5">
        {chip("", "All")}{chip("ACTIVE", "Active & probation")}{chip("PROBATION", "Probation")}{chip("INACTIVE", "Inactive")}
      </div>
    </div>
    {noManager && <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-warning-subtle px-3 py-1 text-sm text-warning">
      Showing people with no manager
      <Button variant="ghost" type="button" onClick={() => setNoManager(false)} aria-label="Show everyone again" className="rounded-full p-0.5 hover:bg-warning/20 h-auto whitespace-normal"><X className="h-3.5 w-3.5" /></Button>
    </p>}
    {people.isPending ? <p role="status" className="mt-4 text-sm text-muted-foreground">Loading people…</p>
      : people.error ? <p role="alert" className="mt-4 text-sm text-danger">{(people.error as Error).message}</p>
      : !people.data?.data.length ? <p className="mt-4 text-sm text-muted-foreground">No people match this selection.</p>
      : <div className="mt-4 overflow-x-auto">
        <Table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="py-2 pr-4 font-semibold">Name</th><th className="py-2 pr-4 font-semibold">Code</th><th className="py-2 pr-4 font-semibold">Job title</th>
              {branches.length > 1 && <th className="py-2 pr-4 font-semibold">Branch</th>}<th className="py-2 font-semibold">Status</th></tr>
          </thead>
          <tbody>
            {people.data.data.map(person => { const name = personFullName(person); return <tr key={person.id} className="border-t border-border">
              <td className="py-2.5 pr-4"><div className="flex items-center gap-2.5">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">{initials(name)}</span>
                <Link href={`/ems/employees/${encodeURIComponent(person.id)}`} className="font-medium text-primary hover:underline">{name}</Link>
              </div></td>
              <td className="py-2.5 pr-4 text-foreground">{person.employeeCode ?? "—"}</td>
              <td className="py-2.5 pr-4 text-foreground">{person.jobTitle ?? "—"}</td>
              {branches.length > 1 && <td className="py-2.5 pr-4 text-foreground">{person.plantBranch ?? "—"}</td>}
              <td className="py-2.5"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[person.employmentStatus] ?? "bg-muted text-foreground"}`}>{statusLabel(person.employmentStatus)}</span></td>
            </tr>; })}
          </tbody>
        </Table>
      </div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{people.data?.pagination.total ?? 0} people · Page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button variant="ghost" type="button" className={`${secondary} h-auto whitespace-normal`} disabled={page <= 1 || people.isFetching} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <Button variant="ghost" type="button" className={`${secondary} h-auto whitespace-normal`} disabled={page >= pages || people.isFetching} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>
    </div>
  </section>;
}
