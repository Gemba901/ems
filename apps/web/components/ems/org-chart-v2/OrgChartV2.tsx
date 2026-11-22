"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Crosshair, Maximize2, Minus, Plus, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { readOrgChart } from "@/services/ems-org-chart.service";
import {
  BODY_LABEL, CARD, ISSUE_LABEL, OTHER_COLOUR, ZOOM, bestLayout, branchName, cardMode, chartSummary, clampZoom, departmentColours, departmentTops, findPeople,
  fitZoom, indexChart, initials, layoutTree, leadershipOpen, outlineRows, peersOf, SUMMARY_STRIP, wholeCompany, zoomAround, type LayoutShape,
  type ChartData, type ChartIndex, type ChartPerson,
} from "./model";

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500";

type Layout = "CHART" | "LIST";
type UrlState = { focus: string | null; layout: Layout; deep: boolean };
const LAYOUTS: [Layout, string][] = [["CHART", "Chart"], ["LIST", "List"]];
/** Focus, layout and the second-level switch live in the address, so Back steps through where you've been. */
function readUrl(): UrlState {
  const p = new URLSearchParams(window.location.search);
  const named = (p.get("layout") ?? "").toUpperCase();
  // No layout in the address: the tree on wide screens, Focus on phones.
  // The old Focus view is now the branch under the Chart, so old ?layout=focus links open the Chart.
  const layout: Layout = named === "LIST" ? "LIST" : "CHART";
  return { focus: p.get("focus"), layout, deep: p.get("teams") === "1" };
}
function writeUrl(next: UrlState, push: boolean) {
  const p = new URLSearchParams(window.location.search);
  if (next.focus) p.set("focus", next.focus); else p.delete("focus");
  p.set("layout", next.layout.toLowerCase());
  if (next.deep) p.set("teams", "1"); else p.delete("teams");
  const url = `${window.location.pathname}${p.size ? `?${p}` : ""}`;
  if (push) window.history.pushState(window.history.state, "", url); else window.history.replaceState(window.history.state, "", url);
}

function Avatar({ person, size = "md", onDark = false }: { person: ChartPerson; size?: "sm" | "md" | "lg"; onDark?: boolean }) {
  const dims = size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-7 w-7 text-[11px]" : "h-10 w-10 text-xs";
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold ${onDark ? "bg-white/15 text-white" : "bg-violet-100 text-violet-800"} ${dims}`}>{initials(person.name)}</span>;
}
/** The focused person's card is filled dark (deep indigo) with white text, everywhere it appears. */
const FOCUS_FILL = "#1E1B4B";

/** The body someone reports to (Board, Owner…), when they're at the very top: shown on their card everywhere. */
const topBody = (person: ChartPerson) => person.reportsToBody ? BODY_LABEL[person.reportsToBody] ?? person.reportsToBody : null;
const TOP_BORDER = "#B45309";
const topBorders = { borderTopColor: TOP_BORDER, borderRightColor: TOP_BORDER, borderBottomColor: TOP_BORDER, borderTopWidth: 2, borderRightWidth: 2, borderBottomWidth: 2 };
/** "Reports to Board" badge for the top person. */
function TopBadge({ person }: { person: ChartPerson }) {
  const body = topBody(person);
  return body ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">Reports to {body}</span> : null;
}

/** A person you can click to focus on: initials, name, job title, department (with its chart colour), team size. */
function PersonCard({ person, index, onFocus, colour, focused = false }: { person: ChartPerson; index: ChartIndex; onFocus: (id: string) => void; colour?: string; focused?: boolean }) {
  const team = index.teamOf(person.id).length, flagged = (index.issuesFor.get(person.id) ?? []).length > 0, top = !!topBody(person);
  return <button type="button" onClick={() => onFocus(person.id)} aria-current={focused || undefined}
    style={{ borderLeft: colour ? `6px solid ${colour}` : undefined, ...(top ? topBorders : {}), ...(focused ? { background: FOCUS_FILL } : {}) }}
    className={`flex w-full min-w-0 items-center gap-2.5 rounded-xl border p-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 ${focused ? "border-violet-500 ring-2 ring-violet-300" : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"}`}>
    <Avatar person={person} onDark={focused} />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5"><span className={`truncate text-sm font-semibold ${focused ? "text-white" : "text-slate-900"}`}>{person.name}</span>
        {flagged && <span title="Reporting needs attention" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}</span>
      <span className={`block truncate text-xs ${focused ? "text-slate-200" : "text-slate-600"}`}>{person.jobTitle ?? "No job title"}</span>
      <span className={`block truncate text-xs ${focused ? "text-violet-200" : "text-violet-700"}`}>{person.department?.name ?? "No department"}</span>
    </span>
    <TopBadge person={person} />
    {team > 0 && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">{team}</span>}
  </button>;
}

export function OrgChartV2() {
  const { accessToken, user } = useAuthStore();
  const chart = useQuery({ queryKey: ["ems-org-chart", user?.organizationId], queryFn: ({ signal }) => readOrgChart(accessToken!, signal) as Promise<ChartData>, enabled: !!accessToken });
  const data = chart.data;
  const index = useMemo(() => data ? indexChart(data) : null, [data]);

  const [state, setState] = useState<UrlState>({ focus: null, layout: "CHART", deep: false });
  useEffect(() => {
    setState(readUrl());
    const onBack = () => setState(readUrl());
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  const update = useCallback((patch: Partial<UrlState>, push = false) => setState(current => {
    const next = { ...current, ...patch }; writeUrl(next, push); return next;
  }), []);
  // Focusing someone: Focus and List go back to the top of the page (their details are there); the Chart only moves itself.
  const layoutRef = useRef(state.layout); layoutRef.current = state.layout;
  const focusOn = useCallback((id: string) => {
    update({ focus: id }, true);
    if (layoutRef.current !== "CHART") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [update]);

  const [term, setTerm] = useState(""), [department, setDepartment] = useState(""), [showGaps, setShowGaps] = useState(false);
  // List layout: teams you've opened or closed by hand; the focused person's line is open unless closed.
  const [open, setOpen] = useState<Set<string>>(new Set()), [closed, setClosed] = useState<Set<string>>(new Set());
  // The last two teams opened with "+", shown in a second colour on the chart.
  const [recent, setRecent] = useState<string[]>([]);
  // Teams drawn as one box ("12 people") after Open all in a big company; clicking a box shows its people.
  const [summarised, setSummarised] = useState<Set<string>>(new Set());
  // Whether the page was opened on a particular person (a link or Back); otherwise the Chart starts on the leadership view.
  const [openedOnPerson] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("focus"));
  const branchRef = useRef<HTMLElement>(null), chartRef = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)"), sync = () => setNarrow(query.matches);
    sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync);
  }, []);
  // The same department colours as the chart, for the branch's cards.
  const colours = useMemo(() => data ? departmentColours(data.people) : null, [data]);
  const [branchVisible, setBranchVisible] = useState(true);
  useEffect(() => {
    const el = branchRef.current; if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setBranchVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(el); return () => observer.disconnect();
  }, [state.layout, data]);

  if (chart.isPending) return <p role="status" className="text-sm text-slate-600">Loading the organisation chart…</p>;
  if (chart.error || !data || !index) return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{(chart.error as Error)?.message ?? "Unable to load the organisation chart"}</p>;
  if (!data.people.length) return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Nobody is registered yet, so there’s no chart to show.</p>;

  const focused = (state.focus && index.byId.get(state.focus)) || index.start!;
  const chain = index.chain(focused.id);
  const top = chain[0] ?? focused;
  const body = top.reportsToBody ? BODY_LABEL[top.reportsToBody] ?? top.reportsToBody : null;
  const team = index.teamOf(focused.id);
  const peers = peersOf(index, focused);
  const manager = focused.managerId ? index.byId.get(focused.managerId) : undefined;
  const summary = chartSummary(index, data);
  const matches = findPeople(data, term);
  const departments = [...new Map(data.people.filter(p => p.department).map(p => [p.department!.id, p.department!.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const departmentLeads = department ? departmentTops(index, data, department) : [];
  // Open teams (shared by Chart and List): the ones you opened, plus the line down to the focused person and their own team.
  const listOpen = new Set([...open, ...chain.map(p => p.id), focused.id, ...(index.start ? [index.start.id] : [])].filter(id => !closed.has(id)));
  const toggleRow = (id: string, isOpen: boolean) => {
    setOpen(current => { const next = new Set(current); if (isOpen) next.delete(id); else next.add(id); return next; });
    setClosed(current => { const next = new Set(current); if (isOpen) next.add(id); else next.delete(id); return next; });
    setRecent(current => isOpen ? current.filter(x => x !== id) : [id, ...current.filter(x => x !== id)].slice(0, 2));
  };
  // Commands from the chart replace what's open in one step, and clear hand-made exceptions and highlights.
  const replaceOpen = (next: { open: Set<string>; summarised?: Set<string> }) => {
    setOpen(next.open); setClosed(new Set()); setSummarised(next.summarised ?? new Set()); setRecent([]);
  };
  const expandSummary = (id: string) => {
    setSummarised(current => { const next = new Set(current); next.delete(id); return next; });
    setRecent(current => [id, ...current.filter(x => x !== id)].slice(0, 2));
  };
  const glide = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: "smooth", block: "start" });

  // The focused person's details, beside the List view. (Over the chart, a shorter card: see chartDetails.)
  const details = <div className="space-y-3">
    <div className="flex items-center gap-3"><Avatar person={focused} /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{focused.name}</p><p className="truncate text-xs text-slate-600">{focused.jobTitle ?? "No job title"}</p></div></div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt className="text-slate-500">Department</dt><dd className="min-w-0 truncate">{focused.department ? <Link href={`/ems/organisation/departments/${encodeURIComponent(focused.department.id)}`} className="text-violet-800 hover:underline">{focused.department.name}</Link> : "—"}</dd>
      <dt className="text-slate-500">Branch</dt><dd className="min-w-0 truncate">{branchName(focused) ?? "—"}</dd>
      <dt className="text-slate-500">Reports to</dt><dd className="min-w-0 truncate">{manager ? <button type="button" onClick={() => focusOn(manager.id)} className="text-violet-800 hover:underline">{manager.name}</button> : focused.reportsToBody ? BODY_LABEL[focused.reportsToBody] ?? focused.reportsToBody : "—"}</dd>
      <dt className="text-slate-500">Team</dt><dd>{team.length} direct · {index.everyoneBelow(focused.id)} in all</dd>
      <dt className="text-slate-500">Status</dt><dd>{focused.status.charAt(0) + focused.status.slice(1).toLowerCase().replace(/_/g, " ")}</dd>
    </dl>
    {(index.issuesFor.get(focused.id) ?? []).length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{(index.issuesFor.get(focused.id) ?? []).map(k => ISSUE_LABEL[k] ?? k).join(" · ")}</p>}
    <Link href={`/ems/employees/${encodeURIComponent(focused.id)}`} className="block rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Open profile</Link>
  </div>;

  // Over the chart: only what the branch below doesn't already show.
  const chartDetails = <div className="space-y-3">
    <div className="min-w-0"><p className="truncate font-semibold text-slate-900">{focused.name}</p><p className="truncate text-xs text-slate-600">{focused.jobTitle ?? "No job title"}</p></div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      <dt className="text-slate-500">Location</dt><dd className="min-w-0 truncate">{branchName(focused) ?? "—"}</dd>
      <dt className="text-slate-500">Status</dt><dd>{focused.status.charAt(0) + focused.status.slice(1).toLowerCase().replace(/_/g, " ")}</dd>
    </dl>
    {(index.issuesFor.get(focused.id) ?? []).length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{(index.issuesFor.get(focused.id) ?? []).map(k => ISSUE_LABEL[k] ?? k).join(" · ")}</p>}
    <div className="flex flex-wrap gap-2">
      <Link href={`/ems/employees/${encodeURIComponent(focused.id)}`} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Open profile</Link>
      {focused.department && <Link href={`/ems/organisation/departments/${encodeURIComponent(focused.department.id)}`} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">Department</Link>}
    </div>
  </div>;

  // The focused person's branch: the line above them, them, their peers and their team. It is the Focus view, and it
  // also sits under the Chart, updating in place when you click someone there.
  const branchView = <>
          {/* The chain above: click any step to move up. */}
          <nav aria-label="Reporting line" className="flex flex-wrap items-center gap-1 text-sm">
            {body && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{body}</span>}
            {chain.map(p => <span key={p.id} className="flex items-center gap-1"><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
              <button type="button" onClick={() => focusOn(p.id)} className="rounded px-1 text-violet-800 hover:underline">{p.name}</button></span>)}
            <span className="flex items-center gap-1"><ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400" /><span aria-current="true" className="font-semibold text-slate-900">{focused.name}</span></span>
          </nav>

          <section aria-label="Focused person" className="flex flex-wrap items-center gap-4 rounded-2xl border-2 p-4 text-white"
            style={{ background: FOCUS_FILL, borderColor: topBody(focused) ? TOP_BORDER : "#7C3AED", borderLeft: `8px solid ${colours?.colourOf(focused) ?? "#7C3AED"}` }}>
            <Avatar person={focused} size="lg" onDark />
            <div className="min-w-0 flex-1">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-white">{focused.name}<TopBadge person={focused} /></h2>
              <p className="text-sm text-slate-200">{focused.jobTitle ?? "No job title"}{focused.department && <> · {focused.department.name}</>}</p>
              <p className="text-xs text-slate-300">{team.length ? <>{team.length} direct {team.length === 1 ? "report" : "reports"} · {index.everyoneBelow(focused.id)} in their whole team</> : "No direct reports"}</p>
            </div>
            <Link href={`/ems/employees/${encodeURIComponent(focused.id)}`} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-indigo-950 hover:bg-violet-100">Open profile</Link>
          </section>

          {peers.length > 0 && (team.length > 0 || !manager) && <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
            <span>{manager ? <>Also reporting to {manager.name}:</> : <>Also at the top:</>}</span>
            {peers.slice(0, 8).map(p => <button key={p.id} type="button" onClick={() => focusOn(p.id)} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-violet-800 hover:bg-violet-50">{p.name}</button>)}
            {peers.length > 8 && <span className="text-xs text-slate-500">+{peers.length - 8} more</span>}
          </p>}

          {/* Their team, directly under them; it wraps onto as many rows as it needs. */}
          {!team.length && manager ? <section aria-label={`${manager.name}'s team`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            {/* No team of their own: show the team they're part of (their manager's), with them highlighted. */}
            <h3 className="mb-3 px-1 text-sm font-semibold text-slate-800">{focused.name} works in {manager.name}’s team · {index.teamOf(manager.id).length}</h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{index.teamOf(manager.id).map(p => <li key={p.id}>
              <PersonCard person={p} index={index} onFocus={focusOn} colour={colours?.colourOf(p)} focused={p.id === focused.id} /></li>)}</ul>
          </section> : <section aria-label={`${focused.name}'s team`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <h3 className="mb-3 px-1 text-sm font-semibold text-slate-800">{focused.name}’s team · {team.length}</h3>
            {!team.length ? <p className="px-1 text-sm text-slate-500">Nobody reports to {focused.name}.</p>
              : !state.deep ? <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{team.map(p => <li key={p.id}><PersonCard person={p} index={index} onFocus={focusOn} colour={colours?.colourOf(p)} /></li>)}</ul>
              : <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {/* Second level: each member's own team in a block labelled with their name, directly under them. */}
                {team.map(p => { const theirs = index.teamOf(p.id); return <li key={p.id} className="rounded-xl border border-slate-200 bg-white p-2">
                  <PersonCard person={p} index={index} onFocus={focusOn} colour={colours?.colourOf(p)} />
                  {theirs.length > 0 ? <div className="mt-2 rounded-lg border-l-2 border-violet-300 bg-violet-50/50 p-2">
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">{p.name.split(" ")[0]}’s team · {theirs.length}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {theirs.slice(0, 12).map(m => <button key={m.id} type="button" onClick={() => focusOn(m.id)} title={[m.jobTitle, m.department?.name].filter(Boolean).join(" · ")}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-0.5 pl-0.5 pr-2.5 text-xs text-slate-800 hover:border-violet-300"><Avatar person={m} size="sm" />{m.name}</button>)}
                      {theirs.length > 12 && <button type="button" onClick={() => focusOn(p.id)} className="text-xs font-semibold text-violet-800 hover:underline">+{theirs.length - 12} more</button>}
                    </div>
                  </div> : <p className="mt-1.5 px-1 text-xs text-slate-400">No team</p>}
                </li>; })}
              </ul>}
          </section>}
  </>;

  return <div className="space-y-4">
    {index.unconnected.length > 0 && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <span><strong>Reporting gaps:</strong> {index.unconnected.length} {index.unconnected.length === 1 ? "person isn’t" : "people aren’t"} connected to the chart (no manager, manager not found or has left, or a loop).</span>
      <button type="button" aria-expanded={showGaps} onClick={() => setShowGaps(v => !v)} className="ml-auto rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-semibold text-violet-800">{showGaps ? "Hide them" : "Show them"}</button>
    </div>}
    {showGaps && <section aria-label="Not connected" className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-3">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {index.unconnected.map(p => <li key={p.id}>
          <PersonCard person={p} index={index} onFocus={focusOn} colour={colours?.colourOf(p)} />
          <p className="mt-1 px-1 text-xs text-amber-900">{(index.issuesFor.get(p.id) ?? []).map(k => ISSUE_LABEL[k] ?? k).join(" · ")}</p>
        </li>)}
      </ul>
    </section>}

    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="relative min-w-52 flex-1">
        <label className="text-xs font-medium text-slate-600">Find a person
          <span className="relative mt-1 block"><Search size={16} aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400" />
            <input type="search" value={term} onChange={e => setTerm(e.target.value)} placeholder="Name, job title or department" className={`${field} w-full pl-9`} /></span>
        </label>
        {matches.length > 0 && <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {matches.map(p => <li key={p.id}><button type="button" onClick={() => { setTerm(""); focusOn(p.id); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50">
            <Avatar person={p} size="sm" /><span className="min-w-0"><span className="block truncate font-medium text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{[p.jobTitle, p.department?.name].filter(Boolean).join(" · ")}</span></span>
          </button></li>)}
        </ul>}
      </div>
      <label className="text-xs font-medium text-slate-600">Department
        <select value={department} onChange={e => setDepartment(e.target.value)} className={`${field} mt-1 block min-w-44`}>
          <option value="">Whole company</option>{departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
      <div role="group" aria-label="Layout" className="flex overflow-hidden rounded-lg border border-slate-300">
        {LAYOUTS.map(([l, text]) => <button key={l} type="button" aria-pressed={state.layout === l} onClick={() => update({ layout: l })}
          className={`min-h-10 px-3 text-sm ${state.layout === l ? "bg-violet-700 font-semibold text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}>{text}</button>)}
      </div>
    </div>
    {departmentLeads.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-slate-600">Top of {departments.find(([id]) => id === department)?.[1]}:</span>
      {departmentLeads.slice(0, 12).map(p => <button key={p.id} type="button" onClick={() => focusOn(p.id)} className="rounded-full border border-violet-200 bg-white px-3 py-1 text-violet-800 hover:bg-violet-50">{p.name}</button>)}
      {departmentLeads.length > 12 && <span className="text-xs text-slate-500">+{departmentLeads.length - 12} more</span>}
    </div>}
    <p className="text-xs text-slate-500">{summary.people} people · {summary.layers} layers · on average {summary.average} direct reports per manager. Source: {data.source} · Loaded {new Date(data.refreshedAt).toLocaleString()}.</p>

    <div className={state.layout === "CHART" ? "" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]"}>
      <div className="min-w-0 space-y-4">
        {state.layout === "CHART" ? <div className="flex flex-col gap-4">
          <section ref={chartRef} className="scroll-mt-4">
            <ChartCanvas index={index} people={data.people} open={listOpen} summarised={summarised} focusPath={[...chain.map(p => p.id), focused.id]} recent={recent}
              openedOnPerson={openedOnPerson} onFocus={focusOn} onToggle={toggleRow} onReplace={replaceOpen} onExpandSummary={expandSummary}
              onStartAgain={() => update({ focus: null }, true)} onRefresh={() => void chart.refetch()} refreshing={chart.isFetching} details={chartDetails}
              branchVisible={branchVisible} branchAbove={narrow} onGoToBranch={() => glide(branchRef.current)} />
          </section>
          {/* The clicked person's branch, below the chart. It updates in place; the page only moves when you ask. */}
          <section ref={branchRef} aria-label="Branch" className="scroll-mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 max-md:order-first">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Branch · {focused.name}</h2>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={state.deep} onChange={e => update({ deep: e.target.checked })} className="h-4 w-4 accent-violet-700" /> Show their teams too</label>
                <button type="button" onClick={() => glide(chartRef.current)} className="inline-flex items-center gap-1 text-sm font-medium text-violet-800 hover:underline">
                  {narrow ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />} {narrow ? "Chart below" : "Back to chart"}</button>
              </div>
            </div>
            {branchView}
          </section>
        </div>
        : <section aria-label="Outline" className="rounded-2xl border border-slate-200 bg-white p-2">
          <ul>
            {outlineRows(index, listOpen).map(({ person, depth }) => { const size = index.teamOf(person.id).length, isOpen = listOpen.has(person.id); return <li key={person.id}
              className={`flex items-center gap-2 rounded-lg py-1.5 pr-2 ${person.id === focused.id ? "bg-violet-50" : ""}`} style={{ paddingLeft: 8 + depth * 22 }}>
              {size ? <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} ${person.name}’s team of ${size}`}
                onClick={() => toggleRow(person.id, isOpen)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-800">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
                : <span className="w-7 shrink-0" />}
              <Avatar person={person} size="sm" />
              <button type="button" onClick={() => update({ focus: person.id }, true)} className="min-w-0 truncate text-left text-sm">
                <span className="font-semibold text-slate-900">{person.name}</span><span className="text-slate-500"> · {[person.jobTitle, person.department?.name].filter(Boolean).join(" · ")}</span>
              </button>
              {size > 0 && <span className="ml-auto shrink-0 text-xs text-slate-500">{size} in team</span>}
            </li>; })}
          </ul>
        </section>}
      </div>

      {state.layout !== "CHART" && <aside aria-label="Person details" className="h-fit rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4">{details}</aside>}
    </div>
  </div>;
}

/**
 * The Chart view: the company as a tree, teams under their managers, joined by lines.
 *
 * Every command has one fixed result, whatever the starting state:
 * - Start again: no focus, leadership view, fitted.         - Open all: every team open (big companies: member teams
 * - Close all: leadership view, fitted.                       as one box each), fitted.
 * - Fit: everything currently open, fitted; says so if it can't be done readably.
 * - − / % / +: zoom only.   - Centre on focus: scroll only (and bring the chart on screen).
 * - Clicking a person: focus them and glide to them; if too small to read, zoom to 70%.
 * - Opening or closing a team: only that team changes; the arrangement stays (it's only re-chosen by the commands
 *   above and by resizing the window).
 */
function ChartCanvas({ index, people, open, summarised, focusPath, recent, openedOnPerson, onFocus, onToggle, onReplace, onExpandSummary, onStartAgain, onRefresh, refreshing,
  details, branchVisible, branchAbove, onGoToBranch }: {
  index: ChartIndex; people: ChartPerson[]; open: Set<string>; summarised: Set<string>; focusPath: string[]; recent: string[]; openedOnPerson: boolean;
  onFocus: (id: string) => void; onToggle: (id: string, isOpen: boolean) => void; onReplace: (next: { open: Set<string>; summarised?: Set<string> }) => void;
  onExpandSummary: (id: string) => void; onStartAgain: () => void; onRefresh: () => void; refreshing: boolean; details: ReactNode;
  branchVisible: boolean; branchAbove: boolean; onGoToBranch: () => void;
}) {
  const pad = 32, FOCUS_ZOOM = 0.7;
  const focusedId = focusPath[focusPath.length - 1];
  const box = useRef<HTMLDivElement>(null);

  // The chart area's outside size (fixed by the page, not by the drawing or its scrollbars), so it can't feed back.
  const [view, setView] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => setView(previous => {
      const width = el.offsetWidth, height = el.offsetHeight;
      return previous && Math.abs(previous.width - width) < 8 && Math.abs(previous.height - height) < 8 ? previous : { width, height };
    });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const viewWidth = Math.max(320, (view?.width ?? 1200) - 24), viewHeight = Math.max(240, (view?.height ?? 600) - 24);

  // The arrangement (how big teams wrap) is kept until a command or a resize chooses again.
  const [shape, setShape] = useState<LayoutShape>({ perRow: CARD.perRow, leafColumns: CARD.leafColumns });
  const tree = useMemo(() => layoutTree(index, index.tops, open, shape, summarised), [index, open, shape, summarised]);
  const { colourOf, legend, others } = useMemo(() => departmentColours(people), [people]);
  const [legendOpen, setLegendOpen] = useState(false);
  const drawWidth = tree.width + pad * 2, drawHeight = tree.height + pad * 2 + 24;

  const [zoom, setZoom] = useState(1);
  // Details start open on wider screens; on phones they'd cover the chart, so they start as a button.
  const [showDetails, setShowDetails] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches);
  const [notice, setNotice] = useState<string | null>(null);
  const mode = cardMode(zoom);
  const zoomRef = useRef(1), pending = useRef<{ left: number; top: number } | null>(null);
  const applyZoom = (to: number, scroll: { left: number; top: number }) => {
    if (to === zoomRef.current) { box.current?.scrollTo(scroll); return; }
    pending.current = scroll; zoomRef.current = to; setZoom(to);
  };
  const zoomTo = useCallback((next: number, point?: { x: number; y: number }) => {
    const el = box.current; if (!el) return;
    const from = zoomRef.current, to = clampZoom(next);
    if (to === from) return;
    const at = point ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    pending.current = zoomAround(pending.current ?? { left: el.scrollLeft, top: el.scrollTop }, at, from, to);
    zoomRef.current = to; setZoom(to);
  }, []);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && pending.current) { el.scrollTo({ left: pending.current.left, top: pending.current.top }); pending.current = null; }
  }, [zoom]);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  /** Where to scroll so the focused person sits in the middle, a third of the way down, at zoom `z`. */
  const focusScroll = useCallback((z: number) => {
    const node = tree.nodes.find(n => n.key === focusedId), el = box.current;
    if (!node || !el) return null;
    return { left: Math.max(0, (node.x + pad + CARD.width / 2) * z - el.clientWidth / 2), top: Math.max(0, (node.y + pad) * z - el.clientHeight / 3) };
  }, [tree, focusedId]);

  // ---- Commands: a short pipeline that runs after the new content has rendered ----
  // "shape" re-chooses the arrangement for what's open now; then "fit" fits it, or "focus" zooms to 70% on the focus.
  const steps = useRef<("shape" | "fit" | "focus")[]>([]);
  const run = (...next: ("shape" | "fit" | "focus")[]) => { steps.current = next; setTick(t => t + 1); };
  const [tick, setTick] = useState(0);
  const fitNow = () => {
    const el = box.current; if (!el) return;
    const needed = Math.min(1, (el.clientWidth - 8) / drawWidth, (el.clientHeight - 8) / drawHeight);
    const to = fitZoom(drawWidth, drawHeight, el.clientWidth - 8, el.clientHeight - 8);
    setNotice(needed < ZOOM.min ? "Too large to fit on one screen. Zoom in to read, or use Close all for the leadership view."
      : to < ZOOM.blocks ? "Showing the shape of the company. Zoom in, or click anyone, to read names." : null);
    applyZoom(to, { left: 0, top: 0 });
  };
  useEffect(() => {
    const step = steps.current[0];
    if (!step || !view) return;
    if (step === "shape") {
      steps.current = steps.current.slice(1);
      const best = bestLayout(index, index.tops, open, viewWidth, viewHeight, summarised).shape;
      if (best.perRow !== shape.perRow || best.leafColumns !== shape.leafColumns) { setShape(best); return; } // continue after re-render
      setTick(t => t + 1); return;
    }
    steps.current = steps.current.slice(1);
    if (step === "fit") fitNow();
    if (step === "focus") { const at = focusScroll(FOCUS_ZOOM); if (at) { setNotice(null); applyZoom(FOCUS_ZOOM, at); } }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, tree, view]);

  const leadership = () => leadershipOpen(index, viewWidth, viewHeight);
  const startAgain = () => { onStartAgain(); onReplace({ open: leadership() }); run("shape", "fit"); };
  const openAll = () => { onReplace(wholeCompany(index, people)); run("shape", "fit"); };
  const closeAll = () => { onReplace({ open: leadership() }); run("shape", "fit"); };
  const fit = () => run("shape", "fit");

  // First time the chart's size is known: the leadership view, or the person the link points to.
  const started = useRef(false);
  useEffect(() => {
    if (!view || started.current) return;
    started.current = true;
    if (openedOnPerson) run("shape", "focus"); else { onReplace({ open: leadership() }); run("shape", "fit"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  // A real window resize re-chooses the arrangement (zoom stays).
  const lastView = useRef(view);
  useEffect(() => {
    if (!view || !lastView.current) { lastView.current = view; return; }
    if (lastView.current !== view) { lastView.current = view; if (!steps.current.length) run("shape"); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Clicking someone: glide to them; if too small to read, zoom to 70% on them.
  const lastFocus = useRef(focusedId);
  useEffect(() => {
    if (lastFocus.current === focusedId) return;
    lastFocus.current = focusedId;
    if (steps.current.length) return; // a command is already positioning the chart
    if (zoomRef.current < ZOOM.compact) { const at = focusScroll(FOCUS_ZOOM); if (at) applyZoom(FOCUS_ZOOM, at); return; }
    const at = focusScroll(zoomRef.current); if (at) box.current?.scrollTo({ ...at, behavior: "smooth" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, tree]);
  const centre = () => {
    box.current?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const at = focusScroll(zoomRef.current); if (at) box.current?.scrollTo({ ...at, behavior: "smooth" });
  };

  // Drag the background to move around; cards, buttons and overlays still work normally.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button, a, [data-chart-overlay]") || !box.current) return;
    drag.current = { x: e.clientX, y: e.clientY, left: box.current.scrollLeft, top: box.current.scrollTop };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current || !box.current) return;
    box.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    box.current.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  };
  const stop = () => { drag.current = null; };

  // Coloured routes: the last two opened teams (teal, dashed), then the focus path and the focused person's team (violet).
  const points = (key: string) => tree.routes.get(key)?.map(([x, y]) => `${x + pad},${y + pad}`).join(" ");
  const routesOf = (id: string) => summarised.has(id) ? [] : index.teamOf(id).map(p => points(p.id));
  const recentRoutes = recent.flatMap(id => open.has(id) ? routesOf(id) : []).filter(Boolean) as string[];
  const focusRoutes = [...focusPath.slice(1).map(points), ...(open.has(focusedId) ? routesOf(focusedId) : [])].filter(Boolean) as string[];

  const onChart = tree.nodes.reduce((n, node) => n + 1 + (node.summary ?? 0), 0), boxes = tree.nodes.filter(n => n.summary !== undefined).length;
  const focusedPerson = index.byId.get(focusedId);
  const toolButton = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  return <section aria-label="Organisation chart" className="rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-2.5">
      <button type="button" onClick={startAgain} className={toolButton}><RotateCcw className="h-4 w-4" /> Start again</button>
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-200" />
      <button type="button" onClick={openAll} className={toolButton}>Open all</button>
      <button type="button" onClick={closeAll} className={toolButton}>Close all</button>
      <div role="group" aria-label="Zoom" className="ml-auto flex flex-wrap items-center gap-1.5">
        <button type="button" aria-label="Zoom out" onClick={() => zoomTo(zoomRef.current / ZOOM.step)} disabled={zoom <= ZOOM.min} className={toolButton}><Minus className="h-4 w-4" /></button>
        <button type="button" aria-label="Zoom to 100%" title="Back to 100%" onClick={() => zoomTo(1)} className={`${toolButton} w-16 tabular-nums`}>{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomTo(zoomRef.current * ZOOM.step)} disabled={zoom >= ZOOM.max} className={toolButton}><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={fit} className={toolButton}><Maximize2 className="h-4 w-4" /> Fit</button>
        <button type="button" onClick={centre} className={toolButton}><Crosshair className="h-4 w-4" /> Centre on focus</button>
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh the data" title="Refresh the data" className={toolButton}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></button>
      </div>
    </div>
    {/* What's on screen, so every command visibly does something. */}
    <p role="status" className="border-b border-slate-100 px-3 py-1.5 text-xs text-slate-600">
      Showing {onChart.toLocaleString()} of {people.length.toLocaleString()} people{boxes > 0 && <> ({boxes} teams shown as a count under their manager; click a count to see the people)</>} · {Math.round(zoom * 100)}%{focusedPerson && <> · focus: <strong className="font-semibold text-slate-800">{focusedPerson.name}</strong></>}
      {notice && <span className="ml-1 font-medium text-amber-800">· {notice}</span>}
    </p>

    <div className="relative">
      <div ref={box} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={stop} onPointerLeave={stop}
        className="h-[60vh] min-h-[420px] cursor-grab overflow-auto rounded-b-2xl active:cursor-grabbing"
        style={{ overscrollBehavior: "contain", scrollbarGutter: "stable", overflowAnchor: "none" }}>
        {/* The scroll area is exactly the zoomed size (the unzoomed drawing is clipped), so zooming can't leave stale scroll bounds behind. */}
        <div className="relative overflow-hidden" style={{ width: drawWidth * zoom, height: drawHeight * zoom }}>
          <div className="absolute left-0 top-0" style={{ width: drawWidth, height: drawHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
            <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0" width={drawWidth} height={drawHeight}>
              {tree.lines.map((l, i) => <line key={i} x1={l.x1 + pad} y1={l.y1 + pad} x2={l.x2 + pad} y2={l.y2 + pad} stroke="#CBD5E1" strokeWidth={2} />)}
              {recentRoutes.map((p, i) => <polyline key={`r${i}`} points={p} fill="none" stroke="#0D9488" strokeWidth={3} strokeDasharray="8 6" strokeLinejoin="round" />)}
              {focusRoutes.map((p, i) => <polyline key={`f${i}`} points={p} fill="none" stroke="#7C3AED" strokeWidth={4} strokeLinejoin="round" />)}
            </svg>
            {tree.nodes.map(node => {
              const { person, x, y, teamSize, open: isOpen, summary } = node;
              const style = { left: x + pad, top: y + pad, width: CARD.width };
              const focused = person.id === focusedId, flagged = (index.issuesFor.get(person.id) ?? []).length > 0, top = !!topBody(person);
              const label = `${person.name}${person.jobTitle ? `, ${person.jobTitle}` : ""}${person.department ? `, ${person.department.name}` : ""}`;
              return <div key={node.key} className="absolute" style={style}>
                {mode === "BLOCK"
                  ? <button type="button" onClick={() => onFocus(person.id)} aria-label={label} title={label} aria-current={focused || undefined}
                      className="relative block w-full rounded-xl" style={{ height: CARD.height, background: colourOf(person), outline: focused ? `${Math.ceil(4 / zoom)}px solid ${FOCUS_FILL}` : top ? `${Math.ceil(3 / zoom)}px solid ${TOP_BORDER}` : undefined, outlineOffset: focused || top ? Math.ceil(3 / zoom) : undefined }}>
                      {focused && <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 bg-white" style={{ borderColor: FOCUS_FILL }} />}
                    </button>
                  : <button type="button" onClick={() => onFocus(person.id)} aria-current={focused || undefined} aria-label={label}
                      className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 ${focused ? "border-violet-500 ring-4 ring-violet-300" : "border-slate-200 bg-white hover:border-violet-300"}`}
                      style={{ height: CARD.height, borderLeft: `6px solid ${colourOf(person)}`, ...(top ? topBorders : {}), ...(focused ? { background: FOCUS_FILL } : {}) }}>
                      {mode === "FULL" ? <>
                        <Avatar person={person} onDark={focused} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5"><span className={`truncate text-sm font-semibold ${focused ? "text-white" : "text-slate-900"}`}>{person.name}</span>
                            {flagged && <span title="Reporting needs attention" className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />}</span>
                          <span className={`block truncate text-xs ${focused ? "text-slate-200" : "text-slate-600"}`}>{person.jobTitle ?? "No job title"}</span>
                          <span className={`block truncate text-xs ${focused ? "text-violet-200" : "text-violet-700"}`}>{person.department?.name ?? "No department"}</span>
                        </span>
                      </> : <span className={`min-w-0 flex-1 truncate text-2xl font-semibold leading-tight ${focused ? "text-white" : "text-slate-900"}`}>{person.name}</span>}
                    </button>}
                {top && mode === "FULL" && <span className="absolute -top-2.5 right-2"><TopBadge person={person} /></span>}
                {/* A team shown as a strip ("12 people ▸") in the department's colour; click to see its people. */}
                {summary !== undefined && <button type="button" onClick={() => onExpandSummary(person.id)} aria-label={`Show ${person.name}’s team of ${summary}`}
                  title={`${person.name}’s team: ${summary} people`}
                  className={`absolute inset-x-1 rounded-b-lg border-2 border-t-0 bg-white font-semibold text-slate-800 hover:bg-slate-50 ${mode === "BLOCK" ? "" : mode === "FULL" ? "text-xs" : "text-xl"}`}
                  style={{ top: CARD.height, height: SUMMARY_STRIP - 4, borderColor: colourOf(person),
                    background: mode === "BLOCK" ? `repeating-linear-gradient(135deg, ${colourOf(person)}, ${colourOf(person)} 8px, #fff 8px, #fff 14px)` : undefined }}>
                  {mode !== "BLOCK" && <>{summary} people ▸</>}</button>}
                {teamSize > 0 && summary === undefined && mode !== "BLOCK" && <button type="button" onClick={() => onToggle(person.id, isOpen)} aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Hide" : "Show"} ${person.name}’s team of ${teamSize}`}
                  className={`absolute left-1/2 -translate-x-1/2 rounded-full border border-violet-200 bg-violet-50 font-semibold text-violet-800 hover:bg-violet-100 ${mode === "FULL" ? "-bottom-3 px-2.5 py-0.5 text-xs" : "-bottom-4 px-3 py-0 text-xl"}`}>
                  {isOpen ? `− ${teamSize}` : `+${teamSize}`}</button>}
              </div>;
            })}
          </div>
        </div>
      </div>

      {/* Details of the focused person, floating so the chart keeps the full width. */}
      <div data-chart-overlay className="absolute right-4 top-3 z-20">
        {showDetails
          ? <div className="w-72 max-w-[calc(100vw-4rem)] rounded-xl border-2 border-slate-400 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
                <button type="button" aria-label="Hide details" onClick={() => setShowDetails(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
              {details}
            </div>
          : <button type="button" onClick={() => setShowDetails(true)} className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-lg hover:bg-slate-50">Details</button>}
      </div>

      {/* The branch view is below; offered, never forced. */}
      {!branchVisible && <button data-chart-overlay type="button" onClick={onGoToBranch}
        className="absolute bottom-3 right-4 z-20 inline-flex items-center gap-1.5 rounded-lg border-2 border-violet-300 bg-white px-3 py-1.5 text-sm font-semibold text-violet-800 shadow-lg hover:bg-violet-50">
        {branchAbove ? <>Branch above <ArrowUp className="h-4 w-4" /></> : <>Branch below <ArrowDown className="h-4 w-4" /></>}</button>}

      {/* What the colours mean. */}
      <div data-chart-overlay className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-12rem)] rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 shadow-md">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke="#7C3AED" strokeWidth="4" /></svg>Focus path</span>
          <span className="flex items-center gap-1.5"><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke="#0D9488" strokeWidth="3" strokeDasharray="6 4" /></svg>Just opened</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-5 rounded-sm border-2" style={{ borderColor: TOP_BORDER }} />Reports to Board / Owner</span>
          <button type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen(v => !v)} className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-violet-800">
            Departments legend {legendOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
        </div>
        {legendOpen && <div className="mt-1.5 flex max-h-28 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
          {legend.map(d => <span key={d.id} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: d.colour }} />{d.name} ({d.people})</span>)}
          {others.departments > 0 && <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: OTHER_COLOUR }} />Other: {others.departments} smaller departments ({others.people})</span>}
        </div>}
      </div>
    </div>
  </section>;
}
