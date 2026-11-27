"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Search, X } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { EmsOrganisationService } from "@/services/ems-organisation.service";
import { BranchLabel, branchShade, HodLine, HodName, IssueList, OrganisationHeader, Pill } from "@/components/ems/OrganisationParts";
import { DepartmentHodDialog } from "@/components/ems/DepartmentHodDialog";
import { coloursForGroups } from "@/components/ems/branch-colours";
import {
  activeOnly, DEFAULT_PAGE_STATE, departmentIssues, departmentMatches, departmentsCsv, departmentSummary, filterDepartments, groupByBranch, hasSeveralBranches,
  hodColumn, hodGroups, hodRows, hodStateCounts, initials, readPageState, sortDepartments, writePageState,
  type DepartmentBranch, type DepartmentDirectoryRow, type DepartmentFilter, type DepartmentSort, type DepartmentsPageState, type DepartmentsView, type HodGrouping, type HodStateFilter,
} from "@/components/ems/department-directory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

const field = "rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";
const linkButton = "text-sm font-medium text-primary hover:underline";
/** Every box on the page: an edge that stands off the grey background (darker outline + a light shadow). */
const box = "rounded-xl border border-border bg-card shadow-sm";
const SETUP = "/ems/onboarding/departments?returnTo=%2Fems%2Forganisation";
const LIST = "/ems/organisation";
// Branch keys are letters and digits only, so this can never clash with one ("" is "Branch not recorded").
const ALL_BRANCHES = "__all__";

type Colours = ReadonlyMap<string, string>;
type Choose = (department: DepartmentDirectoryRow, branch?: string) => void;
/** Shared by every view: the address to come back to, branch colours (only with several branches), Choose HOD (Admins and HR),
 * and "show this person's HOD roles". */
type Ctx = { from: string; multi: boolean; colours: Colours; canChoose: boolean; choose: Choose; showRoles: (personId: string) => void };
const shade = (ctx: Ctx, key: string) => branchShade(ctx.colours, key);

/** A department page, remembering where you came from so its Back returns to this exact view. */
const departmentHref = (id: string, from: string, branch?: string) => {
  const params = new URLSearchParams();
  if (branch !== undefined) params.set("branch", branch);
  if (from !== LIST) params.set("from", from);
  const query = params.toString();
  return `/ems/organisation/departments/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
};

export default function OrganisationPage() {
  // The view lives in the address (useSearchParams), which Next.js reads inside a Suspense boundary.
  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
    <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading departments…</p>}><Departments /></Suspense>
  </ProtectedRoute>;
}

/** "57 · 52 active · 4 probation · 1 inactive" for a branch. */
function Counts({ value }: { value: { total: number; active: number; probation: number; inactive: number } }) {
  return <div>
    <p className="font-semibold text-foreground">{value.total}</p>
    <p className="text-xs text-muted-foreground">{activeOnly(value)} active · {value.probation} probation · {value.inactive} inactive</p>
  </div>;
}

/** The People column: one number, then a chip for each non-zero group. */
function PeopleCell({ value }: { value: { total: number; active: number; probation: number; inactive: number } }) {
  const chips = ([["active", activeOnly(value), "bg-success-subtle text-success"], ["probation", value.probation, "bg-info-subtle text-info"],
    ["inactive", value.inactive, "bg-muted text-muted-foreground"]] as const).filter(([, n]) => n > 0);
  return <div>
    <p className="font-semibold tabular-nums text-foreground">{value.total}</p>
    {chips.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{chips.map(([label, n, tone]) =>
      <span key={label} className={`rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}>{n} {label}</span>)}</div>}
  </div>;
}

/** A segmented switch (Departments | Branches | HODs, Cards | Table, Department | Branch). */
function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <div role="group" aria-label={label} className="flex overflow-hidden rounded-lg border border-border">
    {options.map(([key, text]) => <Button variant="ghost" key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
      className={`whitespace-normal min-h-10 px-3 text-sm ${value === key ? "bg-primary font-semibold text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}>{text}</Button>)}
  </div>;
}

function Departments() {
  const { accessToken, user } = useAuthStore();
  const params = useSearchParams();
  const [state, setState] = useState<DepartmentsPageState>(() => readPageState(new URLSearchParams(params.toString())));
  const update = (patch: Partial<DepartmentsPageState>) => setState(current => ({ ...current, ...patch }));
  const query = writePageState(state), from = query ? `${LIST}?${query}` : LIST;
  // Keep the address in step without adding history entries, so Back and reload return to the same view.
  useEffect(() => { if (window.location.pathname + window.location.search !== from) window.history.replaceState(null, "", from); }, [from]);
  // Another company's choices must never carry over (only on a real switch, not on first load).
  const company = useRef(user?.organizationId);
  useEffect(() => {
    if (company.current && user?.organizationId && company.current !== user.organizationId) setState(DEFAULT_PAGE_STATE);
    company.current = user?.organizationId;
  }, [user?.organizationId]);

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
  // Ranked once across the whole company, like the org chart, so filters never change a branch's colour.
  const colours = useMemo(() => coloursForGroups((data?.branches ?? []).map(b => ({ id: b.key, name: b.label, people: b.total, activePeople: b.active }))), [data]);
  // In the HODs view the search also matches branch names, so it's applied per department-branch entry there.
  const scoped = filterDepartments(all, state.view === "HODS" ? "" : state.search, multi ? state.branch : null);
  const summary = departmentSummary(scoped, multi);
  const rows = sortDepartments(scoped.filter(row => departmentMatches(row, state.filter, multi)), state.sort, multi);
  const isAdmin = user?.roleLevel === Role.ADMIN || user?.roleLevel === Role.SUPER_ADMIN;
  // HR can choose HODs here too, as on the employee profile (the API allows Super Admin, Admin and HR).
  const canChoose = isAdmin || user?.roleLevel === Role.HR;
  const activeView: DepartmentsView = state.view === "BRANCHES" && !multi ? "DEPARTMENTS" : state.view;

  const [choosing, setChoosing] = useState<{ department: DepartmentDirectoryRow; branch?: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const choose: Choose = (department, branch) => { setFeedback(null); setChoosing({ department, branch }); };
  const ctx: Ctx = { from, multi, colours, canChoose, choose, showRoles: hod => update({ view: "HODS", hod }) };

  function exportCsv() {
    // ﻿ tells Excel the file is UTF-8, so names with accents open correctly.
    const blob = new Blob(["﻿" + departmentsCsv(rows, multi)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `departments-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  const chip = (id: DepartmentFilter, label: string) => <Button variant="ghost" key={id} type="button" aria-pressed={state.filter === id} onClick={() => update({ filter: id })}
    className={`whitespace-normal min-h-9 rounded-full border px-3.5 py-1.5 text-sm ${state.filter === id ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card text-foreground hover:bg-muted"}`}>{label}</Button>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <OrganisationHeader actions={<>
      <Button variant="ghost" type="button" className={`${secondary} h-auto whitespace-normal`} onClick={() => void directory.refetch()} disabled={directory.isFetching}>
        <RefreshCw size={15} className={directory.isFetching ? "animate-spin" : ""} /> Refresh</Button>
      {data && rows.length > 0 && <Button variant="ghost" type="button" className={`${secondary} h-auto whitespace-normal`} onClick={exportCsv}><Download size={15} /> Export CSV</Button>}
      {isAdmin && <Link href={SETUP} className={secondary}>Set up departments</Link>}
    </>} />

    {feedback && <p role="status" className="rounded-lg border border-success/30 bg-success-subtle px-4 py-2.5 text-sm text-success">{feedback}</p>}

    {directory.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading departments…</p>
      : directory.error ? <p role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle p-4 text-sm text-danger">{(directory.error as Error).message}</p>
      : data && <>
        <div className="flex flex-wrap items-center gap-2">
          {chip("ALL", `${summary.all} ${summary.all === 1 ? "department" : "departments"}`)}
          {chip("NO_HOD", `${summary.noHod} without HOD`)}
          {chip("ATTENTION", `${summary.attention} need attention`)}
          {chip("EMPTY", `${summary.empty} empty`)}
        </div>
        <p className="text-sm text-muted-foreground">
          {data.counts.total} people · {activeOnly(data.counts)} active · {data.counts.probation} probation · {data.counts.inactive} inactive
          {data.counts.unassigned > 0 && <> · <span className="font-medium text-warning">{data.counts.unassigned} with no department</span></>}
        </p>

        <div className={`flex flex-wrap items-end gap-3 p-4 ${box}`}>
          <label className="min-w-52 flex-1 text-xs font-medium text-muted-foreground">{activeView === "HODS" ? "Find a department, branch or HOD" : "Find a department or HOD"}
            <span className="relative mt-1 block"><Search size={16} aria-hidden="true" className="absolute left-3 top-2.5 text-muted-foreground" />
              <Input type="search" value={state.search} onChange={e => update({ search: e.target.value })}
                placeholder={activeView === "HODS" ? "Department, branch, HOD name or code" : "Department, HOD name or code"} className={`${field} w-full pl-9`} /></span>
          </label>
          {multi && <label className="text-xs font-medium text-muted-foreground">Branch
            <NativeSelect value={state.branch ?? ALL_BRANCHES} onChange={e => update({ branch: e.target.value === ALL_BRANCHES ? null : e.target.value })} className={`${field} mt-1 block min-w-44`}>
              <option value={ALL_BRANCHES}>All branches</option>
              {branches.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </NativeSelect></label>}
          {activeView === "DEPARTMENTS" && <label className="text-xs font-medium text-muted-foreground">Sort
            <NativeSelect value={state.sort} onChange={e => update({ sort: e.target.value as DepartmentSort })} className={`${field} mt-1 block`}>
              <option value="NAME">Name A–Z</option><option value="PEOPLE">Most people</option><option value="FEWEST">Fewest people</option><option value="ISSUES">Most issues</option>
            </NativeSelect></label>}
          <div className="text-xs font-medium text-muted-foreground">View
            <div className="mt-1"><Segments label="View" value={activeView} onChange={view => update({ view })}
              options={multi ? [["DEPARTMENTS", "Departments"], ["BRANCHES", "Branches"], ["HODS", "HODs"]] : [["DEPARTMENTS", "Departments"], ["HODS", "HODs"]]} /></div>
          </div>
        </div>

        {!rows.length ? <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {all.length ? "No departments match these filters." : "No departments have been set up yet."}</div>
          : activeView === "HODS" ? <Hods rows={rows} ctx={ctx} state={state} update={update} />
          : activeView === "BRANCHES" ? <ByBranch rows={rows} ctx={ctx} />
          : <ByDepartment rows={rows} ctx={ctx} />}

        <p className="text-xs text-muted-foreground">Source: {data.source} · Loaded {new Date(data.asOf).toLocaleString()}.</p>
      </>}

    {choosing && accessToken && <DepartmentHodDialog key={`${choosing.department.id}:${choosing.branch ?? ""}`}
      department={choosing.department} branches={choosing.department.branches} company={user?.organizationId} token={accessToken}
      initialBranch={choosing.branch ?? choosing.department.branches.find(b => b.hod.state === "NOT_RECORDED")?.key}
      onClose={() => setChoosing(null)} onSaved={setFeedback} />}
  </div>;
}

/** The HOD column: each branch's HOD in two columns (no avatars); no HOD at all → Choose HOD. Missing branches are named in Status. */
function HodCell({ row, ctx }: { row: DepartmentDirectoryRow; ctx: Ctx }) {
  const { shown, missing } = hodColumn(row);
  if (!row.branches.length) return <span className="text-xs text-muted-foreground">—</span>;
  const several = ctx.multi && shown.length > 1;
  return <div className="space-y-2">
    {shown.length > 0 && <div className={several ? "grid gap-x-5 gap-y-2.5 lg:grid-cols-2" : "space-y-2.5"}>
      {shown.map(b => <div key={b.key} className="min-w-0">
        {ctx.multi && <BranchLabel label={b.label} colour={shade(ctx, b.key)} className="mb-0.5 text-xs" />}
        <HodLine hod={b.hod} compact avatar={false} />
      </div>)}
    </div>}
    {missing.length > 0 && (ctx.canChoose
      ? <Button variant="ghost" type="button" className={`${linkButton} h-auto whitespace-normal`} onClick={() => ctx.choose(row, missing[0].key)}>
        {shown.length && ctx.multi ? `Choose HOD for ${missing.length} more ${missing.length === 1 ? "branch" : "branches"}` : "Choose HOD"}</Button>
      : !shown.length && <span className="text-xs text-muted-foreground">—</span>)}
  </div>;
}

/** Default view: one row per department. The header row stays visible while scrolling. */
function ByDepartment({ rows, ctx }: { rows: DepartmentDirectoryRow[]; ctx: Ctx }) {
  const th = "sticky top-0 z-10 border-b border-border bg-muted px-4 py-3 font-semibold";
  return <>
    <p className="hidden text-xs text-muted-foreground md:block">Status lists what needs doing: branches with no HOD, a HOD who isn’t registered yet, active staff with no manager, or a department with nobody active. Use ⓘ for details.</p>
    <div className={`hidden overflow-clip md:block ${box}`}>
      <Table className="w-full table-fixed text-left text-sm">
        <colgroup><col className="w-[20%]" /><col /><col className="w-60" /><col className="w-[27%]" /></colgroup>
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className={th}>Department</th><th className={th}>{ctx.multi ? "Branch · HOD" : "HOD"}</th>
            <th className={th}>People</th><th className={th}>Status</th></tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(row => <tr key={row.id} className="align-top hover:bg-muted/80">
            <td className="px-4 py-3.5"><Link href={departmentHref(row.id, ctx.from)} className="font-semibold text-foreground hover:text-primary hover:underline">{row.name}</Link></td>
            <td className="px-4 py-3.5"><HodCell row={row} ctx={ctx} /></td>
            <td className="px-4 py-3.5"><PeopleCell value={row} /></td>
            <td className="px-4 py-3.5"><IssueList issues={departmentIssues(row, ctx.multi)} onBranch={ctx.canChoose ? (_, key) => ctx.choose(row, key) : undefined} /></td>
          </tr>)}
        </tbody>
      </Table>
    </div>
    <ul className="space-y-3 md:hidden">
      {rows.map(row => <li key={row.id} className={`p-4 ${box}`}>
        <div className="flex items-baseline justify-between gap-2">
          <Link href={departmentHref(row.id, ctx.from)} className="font-semibold text-foreground hover:text-primary hover:underline">{row.name}</Link>
          <span className="shrink-0 text-sm text-muted-foreground">{row.total} people</span>
        </div>
        <div className="mt-3"><HodCell row={row} ctx={ctx} /></div>
        <div className="mt-3 border-t border-border pt-3"><IssueList issues={departmentIssues(row, ctx.multi)} onBranch={ctx.canChoose ? (_, key) => ctx.choose(row, key) : undefined} /></div>
      </li>)}
    </ul>
  </>;
}

/** "Branches": each branch as a band in its colour, its departments and that branch's HOD underneath. */
function ByBranch({ rows, ctx }: { rows: DepartmentDirectoryRow[]; ctx: Ctx }) {
  return <div className="space-y-6">
    {groupByBranch(rows).map(group => { const colour = shade(ctx, group.key); return <section key={group.key} aria-labelledby={`branch-${group.key}`} className="overflow-clip rounded-xl border-2 bg-card shadow-sm" style={{ borderColor: colour }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-muted px-4 py-3">
        <h2 id={`branch-${group.key}`}><BranchLabel label={group.label} colour={colour} className="text-base" /></h2>
        <p className="text-xs text-muted-foreground">{group.entries.length} {group.entries.length === 1 ? "department" : "departments"} · {group.total} people</p>
      </div>
      <ul className="divide-y divide-border">
        {group.entries.map(({ department, branch }) => <li key={department.id} className="grid gap-3 px-4 py-3 hover:bg-muted/80 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
          <Link href={departmentHref(department.id, ctx.from, branch.key)} className="font-medium text-foreground hover:text-primary hover:underline">{department.name}</Link>
          <div className="flex flex-wrap items-center gap-3"><HodLine hod={branch.hod} compact />
            {ctx.canChoose && branch.hod.state === "NOT_RECORDED" && <Button variant="ghost" type="button" className={`${linkButton} h-auto whitespace-normal`} onClick={() => ctx.choose(department, branch.key)}>Choose HOD</Button>}</div>
          <Counts value={branch} />
        </li>)}
      </ul>
    </section>; })}
  </div>;
}

/** "HODs": who leads what. Cards grouped by department (default) or branch, or a table; "Missing only"; Edit HODs for Admins. */
function Hods({ rows, ctx, state, update }: { rows: DepartmentDirectoryRow[]; ctx: Ctx; state: DepartmentsPageState; update: (patch: Partial<DepartmentsPageState>) => void }) {
  const [editing, setEditing] = useState(false);
  const filters = { state: state.hodState, person: state.hod, search: state.search };
  const entries = hodRows(rows, filters);
  const counts = hodStateCounts(rows, { person: state.hod, search: state.search });
  const groups = ctx.multi ? hodGroups(rows, filters, state.group) : [{ key: "all", label: "", entries }];
  // The person whose HOD roles are shown (their name from any card they head; the address keeps only their id).
  const personName = state.hod ? rows.flatMap(d => d.branches).find(b => b.hod.person?.id === state.hod)?.hod.person?.name ?? "this person" : null;
  const narrowed = state.hodState !== "ALL" || !!state.hod || !!state.search.trim();

  return <div className="space-y-4">
    {/* On wider screens it stays at the top while scrolling; on a phone it scrolls away, so it doesn't cover the cards. */}
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur md:sticky md:top-0 md:z-20">
      <Segments label="Layout" value={state.layout} onChange={layout => update({ layout })} options={[["CARDS", "Cards"], ["TABLE", "Table"]]} />
      {ctx.multi && state.layout === "CARDS" && <div className="flex items-center gap-2 text-sm text-foreground">Group by
        <Segments<HodGrouping> label="Group by" value={state.group} onChange={group => update({ group })} options={[["DEPARTMENT", "Department"], ["BRANCH", "Branch"]]} /></div>}
      <label className="flex min-h-10 items-center gap-2 text-sm text-foreground">Show
        <NativeSelect value={state.hodState} onChange={e => update({ hodState: e.target.value as HodStateFilter })} className={field}>
          {([["ALL", "All"], ["HAS", "Has HOD"], ["MISSING", "No HOD"], ["BY_CHOICE", "No HOD (by choice)"], ["PENDING", "Not registered yet"], ["REVIEW", "Needs review"]] as const)
            .map(([key, label]) => <option key={key} value={key}>{label} ({counts[key]})</option>)}
        </NativeSelect>
      </label>
      {ctx.canChoose && <label className="ml-auto flex min-h-10 items-center gap-2 text-sm font-medium text-foreground">
        <Checkbox role="switch" aria-checked={editing} checked={editing} onCheckedChange={(checked) => setEditing(checked)} />
        Edit HODs
      </label>}
    </div>

    {personName && <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
      Showing {personName}’s HOD roles
      <Button variant="ghost" type="button" onClick={() => update({ hod: null })} aria-label="Show everyone again" className="rounded-full p-0.5 hover:bg-primary/10 h-auto whitespace-normal"><X className="h-3.5 w-3.5" /></Button>
    </p>}

    {!entries.length ? <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      {narrowed ? "No HODs match these filters." : "No departments with people or HODs yet."}</p>
      : state.layout === "CARDS" ? <div className="space-y-6">
        {groups.map(group => <HodSection key={group.key} group={group} ctx={ctx} by={state.group} editing={editing} />)}
      </div>
      : <div className={`overflow-clip ${box}`}>
        <div className="overflow-x-auto"><Table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr>{["Department", ...(ctx.multi ? ["Branch"] : []), "HOD", "State", "People"].map(h => <th key={h} className="sticky top-0 z-10 border-b border-border bg-muted px-4 py-3 font-semibold">{h}</th>)}
              {ctx.canChoose && <th className="sticky top-0 z-10 border-b border-border bg-muted px-4 py-3"><span className="sr-only">Change</span></th>}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map(({ department, branch }) => <tr key={`${department.id}:${branch.key}`} className="hover:bg-muted/80">
              <td className="px-4 py-3"><Link href={departmentHref(department.id, ctx.from, branch.key)} className="font-medium text-foreground hover:text-primary hover:underline">{department.name}</Link></td>
              {ctx.multi && <td className="px-4 py-3"><BranchLabel label={branch.label} colour={shade(ctx, branch.key)} className="font-normal text-foreground" /></td>}
              <td className="px-4 py-3">{branch.hod.person ? <HodLine hod={{ ...branch.hod, state: "ASSIGNED" }} compact avatar={false} onSelect={ctx.showRoles} /> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3">{branch.hod.state === "ASSIGNED" ? <span className="text-xs font-semibold text-success">Confirmed</span> : <HodLine hod={{ ...branch.hod, person: null }} />}</td>
              <td className="px-4 py-3"><Link href={departmentHref(department.id, ctx.from, branch.key)} className="text-primary hover:underline">{branch.total}</Link></td>
              {ctx.canChoose && <td className="px-4 py-3">{(editing || branch.hod.state === "NOT_RECORDED") &&
                <Button variant="ghost" type="button" className={`${linkButton} h-auto whitespace-normal`} onClick={() => ctx.choose(department, branch.key)}>{branch.hod.state === "NOT_RECORDED" ? "Choose HOD" : "Change"}</Button>}</td>}
            </tr>)}
          </tbody>
        </Table></div>
      </div>}
  </div>;
}

/** One group of HOD cards, framed so it's clear where each group ends.
 * By branch: the whole group in the branch's colour, plain cards inside (one colour, not two).
 * By department: a grey frame, cards inside in their branch colours (a department spans several branches). */
function HodSection({ group, ctx, by, editing }: { group: { key: string; label: string; entries: { department: DepartmentDirectoryRow; branch: DepartmentBranch }[] }; ctx: Ctx; by: HodGrouping; editing: boolean }) {
  const byBranch = ctx.multi && by === "BRANCH", byDepartment = ctx.multi && by === "DEPARTMENT";
  const colour = byBranch ? shade(ctx, group.key) : undefined;
  const first = group.entries[0];
  const frame = byBranch ? "rounded-xl border-2 bg-card p-4 shadow-sm" : byDepartment ? `p-4 ${box}` : "";
  return <section aria-labelledby={ctx.multi ? `hods-${group.key}` : undefined} className={frame} style={colour ? { borderColor: colour } : undefined}>
    {ctx.multi && first && <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
      <h2 id={`hods-${group.key}`}>{byBranch ? <BranchLabel label={group.label} colour={colour} className="text-base" />
        : <Link href={departmentHref(first.department.id, ctx.from)} className="text-base font-semibold text-foreground hover:text-primary hover:underline">{group.label}</Link>}</h2>
      <p className="text-xs text-muted-foreground">{group.entries.length} {byBranch ? (group.entries.length === 1 ? "department" : "departments") : (group.entries.length === 1 ? "branch" : "branches")}</p></div>}
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {group.entries.map(({ department, branch }) => <HodCard key={`${department.id}:${branch.key}`} department={department} branch={branch} ctx={ctx}
        heading={byDepartment ? "BRANCH" : "DEPARTMENT"} tinted={ctx.multi} editing={editing} />)}
    </ul>
  </section>;
}

/** One HOD card: department (or branch, when grouped by department) as the heading — the group above already names the other; photo (initials for now), name, position, code, state, people. Missing HODs have a dashed outline. */
function HodCard({ department, branch, ctx, heading, tinted, editing }: { department: DepartmentDirectoryRow; branch: DepartmentBranch; ctx: Ctx; heading: "DEPARTMENT" | "BRANCH"; tinted: boolean; editing: boolean }) {
  const person = branch.hod.person, missing = branch.hod.state === "NOT_RECORDED";
  // Grouped by department, each card has a 2px outline in its branch's colour (dashed when no HOD); otherwise plain cards.
  const colour = tinted ? shade(ctx, branch.key) : undefined;
  const outline = colour ? `border-2 ${missing ? "border-dashed bg-warning-subtle/30" : "bg-card"}` : missing ? "border border-dashed border-warning/50 bg-warning-subtle/40" : "border border-border bg-card";
  const href = departmentHref(department.id, ctx.from, branch.key);
  return <li className={`flex flex-col gap-3 rounded-xl p-4 ${outline}`} style={colour ? { borderColor: colour } : undefined}>
    {heading === "BRANCH" ? <Link href={href} className="hover:underline"><BranchLabel label={branch.label} colour={shade(ctx, branch.key)} /></Link>
      : <Link href={href} className="font-semibold text-foreground hover:text-primary hover:underline">{department.name}</Link>}
    {person ? <div className="flex items-center gap-3">
      <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{initials(person.name)}</span>
      <div className="min-w-0">
        {person.id ? <HodName id={person.id} name={person.name} onSelect={ctx.showRoles} />
          : <p className="truncate font-medium text-foreground">{person.name}</p>}
        <p className="truncate text-sm text-muted-foreground">{person.jobTitle ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{person.employeeCode ? `Code ${person.employeeCode}` : "No code"}</p>
      </div>
    </div> : branch.hod.state === "UNASSIGNED" ? <Pill tone="slate">No HOD (by choice)</Pill> : <p className="text-sm font-medium text-warning">No HOD</p>}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
      <Link href={href} className="text-primary hover:underline">{branch.total} {branch.total === 1 ? "person" : "people"}</Link>
      {person && branch.hod.state !== "ASSIGNED" && <HodLine hod={{ ...branch.hod, person: null }} />}
      {ctx.canChoose && (missing || editing) && <Button variant="ghost" type="button" className={`${linkButton} h-auto whitespace-normal`} onClick={() => ctx.choose(department, branch.key)}>{missing ? "Choose HOD" : "Change"}</Button>}
    </div>
  </li>;
}
