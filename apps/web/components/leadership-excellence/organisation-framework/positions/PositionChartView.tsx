"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Maximize2, Minus, Plus, RefreshCw, RotateCcw, Search, Users, X, ZoomIn } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getPositionChart } from "@/services/leadership-excellence/organisation-framework.service";
import {
  BOX, ZOOM, boundsOf, cardMode, chartColours, defaultOpen, indexPositions, layoutPositions, perRowFor, scopeChoices, scopeOf, searchPositions,
  teamSummary, withPeople, type CardMode, type ChartScope, type ColourBy, type Placed, type PositionIndex,
} from "./layout";
import styles from "./positions.module.css";
import type { Position, PositionChart, PositionCheck } from "./types";

const PAD = 28;

/** 02.02 · Positions, roles & reporting relationships: who holds which position, and which position reports to which. */
export function PositionChartView() {
  const { accessToken, user } = useAuthStore();
  const query = useQuery({
    queryKey: ["lex-positions", user?.organizationId],
    queryFn: ({ signal }) => getPositionChart(accessToken!, signal),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">02.02 · Positions, roles &amp; reporting relationships</p>
        <h1 className="text-2xl font-semibold text-foreground">Make every reporting relationship clear.</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Follow the positions, then see who holds each one. A vacancy does not remove the role from the organisation.</p>
      </header>
      <details className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-card-foreground">
        <summary className="cursor-pointer font-medium">How to use this section</summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p><strong className="text-foreground">What is it?</strong> The positions in your organisation, who holds each one, and which position each reports to.</p>
          <p><strong className="text-foreground">How to use:</strong> select a position to open the positions reporting to it and see its details. Use + and − under a box to open or close a team without selecting it. Find a position by its title or by a holder&apos;s name.</p>
          <p><strong className="text-foreground">Where to correct information:</strong> in EMS. Nothing here changes people or reporting lines.</p>
          <p><strong className="text-foreground">Next:</strong> open 02.03 · Rules &amp; calendar to agree on the performance cycle and default responsibilities.</p>
        </div>
      </details>
      {query.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading positions…</p>
        : query.error ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{(query.error as Error).message}</p>
        : <Positions chart={query.data} onReload={() => void query.refetch()} reloading={query.isFetching} />}
    </div>
  );
}

function Positions({ chart, onReload, reloading }: { chart: PositionChart; onReload: () => void; reloading: boolean }) {
  // A shared role's people become person cards under it (shown when the role is opened, and found by search).
  const full = useMemo(() => withPeople(chart), [chart]);
  const index = useMemo(() => indexPositions(full), [full]);
  const errors = chart.checks.filter(c => c.severity === "ERROR"), warnings = chart.checks.filter(c => c.severity === "WARNING");
  const [showChecks, setShowChecks] = useState(false);
  const shared = chart.positions.filter(p => p.holders.length > 1).length;

  return <>
    <Card size="sm">
      <CardContent className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[1_1_16rem] text-sm">
          <p className="font-medium text-foreground">Source: {chart.source.label}</p>
          <p className="text-muted-foreground">Loaded {new Date(chart.source.loadedAt).toLocaleString()} · read-only · corrections are made in EMS</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowChecks(v => !v)} aria-expanded={showChecks}>
          {errors.length ? <AlertTriangle className="text-gemba-red-ink" /> : <CheckCircle2 className="text-gemba-lime-ink" />}
          {errors.length ? `Check source links (${errors.length})` : "Source links checked"}{warnings.length > 0 && ` · ${warnings.length} notes`}
        </Button>
        <Button variant="outline" size="sm" onClick={onReload} disabled={reloading} title="Reload positions from the latest EMS records">
          <RefreshCw className={reloading ? "animate-spin" : ""} /> Reload data</Button>
        {showChecks && <CheckList checks={chart.checks} className="w-full border-t border-border pt-3" />}
      </CardContent>
    </Card>

    {/* The figures, in the BEES scheme: navy for positions, lime for shared roles, red when people aren't connected. */}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Figure label="Positions" value={chart.positions.length} note="Worked out from job titles and reporting lines" className="border-gemba-navy bg-gemba-navy text-white" sub="text-white/75" />
      <Figure label="People on the chart" value={chart.people.onChart} note={`${chart.people.probation} on probation`} className="border-2 border-gemba-navy bg-card text-card-foreground" />
      <Figure label="Shared roles" value={shared} note="One role held by several people" className="border-2 border-gemba-lime bg-gemba-lime/10 text-foreground" />
      <Figure label="Not connected" value={chart.people.notConnected} note="Reporting to be corrected in EMS"
        className={chart.people.notConnected ? "border-2 border-gemba-red bg-gemba-red/10 text-foreground" : "border border-border bg-card text-card-foreground"} />
    </div>

    {chart.positions.length ? <Chart chart={chart} full={full} index={index} />
      : <p className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No positions yet: nobody at the top of the records leads a team. Check the source links.</p>}
    <p className="text-xs text-muted-foreground">Positions are worked out from people&apos;s job titles and reporting lines until EMS keeps position records. Vacancies and acting cover come with those records.</p>
  </>;
}

/** The gaps in the records, each with the people it concerns. */
function CheckList({ checks, className }: { checks: PositionCheck[]; className?: string }) {
  const ordered = [...checks.filter(c => c.severity === "ERROR"), ...checks.filter(c => c.severity === "WARNING")];
  return <ul className={cn("space-y-2 text-sm", className)}>
    {!ordered.length && <li className="text-muted-foreground">No gaps found in the records.</li>}
    {ordered.map((check, i) => <li key={i} className="flex items-start gap-2">
      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", check.severity === "ERROR" ? "bg-gemba-red" : "bg-gemba-lime")} />
      <span className="min-w-0">
        <span className={check.severity === "ERROR" ? "text-foreground" : "text-muted-foreground"}>{check.message}</span>
        <span className="block text-xs text-muted-foreground">{check.people.join(", ")}</span>
      </span>
    </li>)}
  </ul>;
}

function Figure({ label, value, note, className, sub = "text-muted-foreground" }: { label: string; value: number; note: string; className: string; sub?: string }) {
  return <div className={cn("rounded-xl px-4 py-3", className)}>
    <p className={cn("text-xs font-medium", sub)}>{label}</p>
    <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
    <p className={cn("mt-0.5 text-xs", sub)}>{note}</p>
  </div>;
}

type Pending = { kind: "fit" } | { kind: "fitIds"; ids: Set<string> } | { kind: "team"; id: string; readable?: boolean } | { kind: "centre"; id: string };

/**
 * The chart. What each action does:
 * - Arrival, Collapse all, Start again: the top position and its direct reports, fitted (Start again also clears the
 *   selection, search, highlights and view). Expand all: every position (not shared roles' people), fitted.
 * - Clicking a position at a readable zoom: opens its team and its details, and fits the position and its team on
 *   screen. Zoomed out: selects it and opens its details only; "Zoom to this position" brings you back in.
 * - Search: matches filled, the rest faded, all matches fitted; Previous / Next step through them. A person in a shared
 *   role is found as their own card (the role opens to show them).
 * - View: whole company, the connected structure only, the not-connected part (to fix), one branch or one department.
 * - The branch below the chart shows the selected position's line, the position, its peers and its team, readable.
 */
function Chart({ chart, full, index }: { chart: PositionChart; full: PositionChart; index: PositionIndex }) {
  const [open, setOpen] = useState(() => defaultOpen(index));
  const [selected, setSelected] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [scope, setScope] = useState<ChartScope>({ kind: "COMPANY" });
  const [colourBy, setColourBy] = useState<ColourBy>("DEPARTMENT");
  const [showLine, setShowLine] = useState(true);
  const [term, setTerm] = useState(""), [query, setQuery] = useState(""), [matchAt, setMatchAt] = useState(0);
  useEffect(() => { const t = setTimeout(() => setQuery(term.trim()), 300); return () => clearTimeout(t); }, [term]);

  // The chart area's size (measured at 100%, so zoom never re-arranges), and whether the details card floats (wide).
  const box = useRef<HTMLDivElement>(null), focusPanel = useRef<HTMLDivElement>(null), chartTop = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 600 });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => setArea(a => a.width && Math.abs(a.width - el.offsetWidth) < 8 && Math.abs(a.height - el.offsetHeight) < 8 ? a : { width: el.offsetWidth, height: el.offsetHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(el); return () => observer.disconnect();
  }, []);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 1023px)"), sync = () => setNarrow(q.matches);
    sync(); q.addEventListener("change", sync); return () => q.removeEventListener("change", sync);
  }, []);

  const view = useMemo(() => scopeOf(index, full, scope), [index, full, scope]);
  const choices = useMemo(() => scopeChoices(chart), [chart]);
  const colours = useMemo(() => chartColours(full, colourBy), [full, colourBy]);
  const found = useMemo(() => {
    const result = searchPositions(index, full.positions, query);
    if (!result || !view) return result;
    return { hits: new Set([...result.hits].filter(id => view.shown.has(id))), above: new Set([...result.above].filter(id => view.shown.has(id))) };
  }, [index, full.positions, query, view]);
  const effectiveOpen = useMemo(() => found ? new Set([...open, ...found.above]) : open, [found, open]);
  const tree = useMemo(() => layoutPositions(index, index.roots, effectiveOpen, perRowFor(area.width || 1100), view?.shown), [index, effectiveOpen, area.width, view]);
  const matches = useMemo(() => found ? tree.placed.filter(p => found.hits.has(p.position.id)).sort((a, b) => a.y - b.y || a.x - b.x).map(p => p.position.id) : [], [found, tree]);

  // Margins of half the area at the sides and most of it below, so any position can be brought to the middle.
  const OX = Math.max(28, Math.round(area.width / 2 - BOX.width / 2)), OY = 28;
  const drawWidth = tree.width + OX * 2, drawHeight = tree.height + OY + Math.max(52, Math.round(area.height * 0.75));

  // Zoom. The scroll area is exactly the zoomed size, so zooming can't leave stale scroll bounds behind.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1), scrollAfter = useRef<{ left: number; top: number; smooth?: boolean } | null>(null);
  const setView = useCallback((z: number, scroll: { left: number; top: number; smooth?: boolean }) => {
    const to = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(z * 100) / 100));
    if (to === zoomRef.current) { box.current?.scrollTo({ left: scroll.left, top: scroll.top, behavior: scroll.smooth ? "smooth" : "auto" }); return; }
    scrollAfter.current = scroll; zoomRef.current = to; setZoom(to);
  }, []);
  useLayoutEffect(() => {
    const el = box.current, s = scrollAfter.current;
    if (el && s) { el.scrollTo({ left: s.left, top: s.top, behavior: s.smooth ? "smooth" : "auto" }); scrollAfter.current = null; }
  }, [zoom]);
  const zoomBy = (factor: number) => {
    const el = box.current; if (!el) return;
    const z = zoomRef.current, to = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(z * factor * 100) / 100));
    const cx = (el.scrollLeft + el.clientWidth / 2) / z, cy = (el.scrollTop + el.clientHeight / 2) / z;
    setView(to, { left: Math.max(0, cx * to - el.clientWidth / 2), top: Math.max(0, cy * to - el.clientHeight / 2) });
  };
  /** Fit a rectangle (drawing units) in the area, between `min` and `max` zoom, centred. */
  const fitRect = useCallback((r: { left: number; top: number; right: number; bottom: number }, min: number, max: number, smooth = false) => {
    const el = box.current; if (!el) return;
    const w = r.right - r.left + 56, h = r.bottom - r.top + 56;
    const z = Math.min(max, Math.max(min, Math.floor(Math.min((el.clientWidth - 8) / w, (el.clientHeight - 8) / h) * 100) / 100));
    const cx = (r.left + r.right) / 2 + OX, top = Math.max(0, (r.top + OY) * z - 28 - Math.max(0, (el.clientHeight - h * z) / 2));
    setView(z, { left: Math.max(0, cx * z - el.clientWidth / 2), top, smooth });
  }, [OX, OY, setView]);

  // Actions that need the new layout first run right after it's drawn. `run` queues one and asks for a redraw.
  const pending = useRef<Pending | null>({ kind: "fit" });
  const [, redraw] = useState(0);
  const run = useCallback((action: Pending) => { pending.current = action; redraw(n => n + 1); }, []);
  useEffect(() => {
    const action = pending.current; if (!action || !area.width) return;
    pending.current = null;
    if (action.kind === "fit") { const r = boundsOf(tree.placed, new Set(tree.placed.map(p => p.position.id))); if (r) fitRect(r, ZOOM.min, 1); return; }
    if (action.kind === "fitIds") { const r = boundsOf(tree.placed, action.ids); if (r) fitRect(r, ZOOM.min, 1); return; }
    const node = tree.placed.find(p => p.position.id === action.id), el = box.current;
    if (!node || !el) return;
    if (action.kind === "centre") {
      const z = zoomRef.current;
      el.scrollTo({ left: Math.max(0, (node.x + OX + BOX.width / 2) * z - el.clientWidth / 2), top: Math.max(0, (node.y + OY) * z - el.clientHeight / 4), behavior: "smooth" });
      return;
    }
    // The position and its team, fitted: zoom out only as far as needed, never below readable; zoom in only when asked.
    const ids = new Set([action.id, ...(effectiveOpen.has(action.id) ? index.childrenOf(action.id).map(p => p.id) : [])]);
    const r = boundsOf(tree.placed, ids)!;
    const z = zoomRef.current;
    fitRect(r, ZOOM.readable, action.readable ? Math.max(1, z) : Math.max(z, ZOOM.readable), true);
  });

  // Search: fit all matches when the search changes; Previous / Next step through them.
  useEffect(() => {
    setMatchAt(0);
    if (found?.hits.size) run({ kind: "fitIds", ids: found.hits });
  }, [found, run]);
  const goToMatch = (step: number) => {
    if (!matches.length) return;
    const at = (matchAt + step + matches.length) % matches.length;
    setMatchAt(at); setSelected(matches[at]); setShowDetails(true);
    run({ kind: "centre", id: matches[at] });
  };

  const mode: CardMode = cardMode(zoom);
  const remember = (id: string) => setRecent(r => [id, ...r.filter(x => x !== id)].slice(0, 2));
  const select = (id: string) => {
    // Clicking the selected position again closes its team (or its people); once more opens it again.
    if (id === selected && index.childrenOf(id).length) { toggle(id); setShowDetails(true); return; }
    setSelected(id); setShowDetails(true);
    if (mode !== "FULL") return; // zoomed out: details only; the user decides when to zoom in
    const target = index.byId.get(id);
    if (target && !target.person && index.childrenOf(id).length && !open.has(id) && target.holders.length <= 1) { setOpen(o => new Set([...o, id])); remember(id); }
    run({ kind: "team", id });
  };
  const zoomToSelected = () => {
    if (!selected) return;
    const target = index.byId.get(selected);
    if (target && !target.person && target.holders.length <= 1 && index.childrenOf(selected).length && !open.has(selected)) { setOpen(o => new Set([...o, selected])); remember(selected); }
    run({ kind: "team", id: selected, readable: true });
  };
  const toggle = (id: string) => setOpen(o => { const next = new Set(o); if (next.has(id)) next.delete(id); else { next.add(id); remember(id); } return next; });
  // Expand all opens every position, but leaves shared roles closed (their people would swamp the overview).
  const expandAll = () => { setOpen(new Set(full.positions.filter(p => !p.person && p.holders.length <= 1).map(p => p.id))); setRecent([]); run({ kind: "fit" }); };
  const collapseAll = () => { setOpen(defaultOpen(index)); setRecent([]); run({ kind: "fit" }); };
  const startAgain = () => { setSelected(null); setShowDetails(false); setTerm(""); setQuery(""); setScope({ kind: "COMPANY" }); collapseAll(); };
  const chooseScope = (value: string) => {
    const next: ChartScope = value.startsWith("branch:") ? { kind: "BRANCH", branch: value.slice(7) } : value.startsWith("dept:") ? { kind: "DEPARTMENT", departmentId: value.slice(5) }
      : value === "connected" ? { kind: "CONNECTED" } : value === "not-connected" ? { kind: "NOT_CONNECTED" } : { kind: "COMPANY" };
    setScope(next); setRecent([]);
    const info = scopeOf(index, full, next);
    setOpen(info ? new Set([...info.context, ...info.tops.map(p => p.id)]) : defaultOpen(index));
    run(info && info.shown.size ? { kind: "fitIds", ids: info.shown } : { kind: "fit" });
  };
  const scopeValue = scope.kind === "BRANCH" ? `branch:${scope.branch}` : scope.kind === "DEPARTMENT" ? `dept:${scope.departmentId}`
    : scope.kind === "CONNECTED" ? "connected" : scope.kind === "NOT_CONNECTED" ? "not-connected" : "company";

  // The In focus panel below the chart: "In focus below ↓" whenever it's out of sight.
  const [focusOutOfSight, setFocusOutOfSight] = useState(false);
  useEffect(() => {
    if (!selected) { setFocusOutOfSight(false); return; }
    let frame = 0;
    const check = () => {
      frame = 0; const el = focusPanel.current; if (!el) return;
      const r = el.getBoundingClientRect(), shown = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      setFocusOutOfSight(shown < Math.min(140, r.height));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    check(); window.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule); if (focusPanel.current) observer.observe(focusPanel.current);
    return () => { window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [selected]);

  const position = selected ? index.byId.get(selected) : undefined;
  const path = position ? index.pathTo(position.id) : [];
  const pathIds = new Set(path.map(p => p.id));
  const route = (id: string) => tree.routes.get(id)?.map(([x, y]) => `${x + OX},${y + OY}`).join(" ");
  const pathRoutes = path.slice(1).map(p => route(p.id)).filter(Boolean) as string[];
  // While zoomed in, the selected position and the line up to it are never faded (search, view context); zoomed out, or
  // once you move on, they fade again unless they match.
  const lit = (id: string) => mode === "FULL" && pathIds.has(id);
  const recentRoutes = recent.flatMap(id => effectiveOpen.has(id) ? index.childrenOf(id).map(p => route(p.id)) : []).filter(Boolean) as string[];
  // Lines keep the same on-screen thickness at every zoom.
  const px = (n: number) => n / zoom;

  return <Card>
    <CardHeader>
      <CardTitle>Position reporting organogram</CardTitle>
      <CardDescription>Select a position to open its team and see who holds it.</CardDescription>
    </CardHeader>
    {/* styles.chart carries the colour palette for everything below: chart, legend and the In focus panel. */}
    <CardContent className={cn("space-y-3", styles.chart)}>
      <div ref={chartTop} className="flex scroll-mt-4 flex-wrap items-end gap-3">
        <Button variant="outline" size="sm" onClick={startAgain} title="Back to the opening view: clears the selection, search, highlights and view"><RotateCcw /> Start again</Button>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">View
          <select value={scopeValue} onChange={e => chooseScope(e.target.value)}
            className="block h-8 min-w-48 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            <option value="company">Whole company</option>
            {index.roots.length > 1 && <option value="connected">Connected only</option>}
            {(index.roots.length > 1 || chart.people.notConnected > 0) && <option value="not-connected">Not connected (to fix)</option>}
            {chart.multiBranch && choices.branches.length > 1 && <optgroup label="Branch">{choices.branches.map(b => <option key={b} value={`branch:${b}`}>{b}</option>)}</optgroup>}
            <optgroup label="Department">{choices.departments.map(d => <option key={d.id} value={`dept:${d.id}`}>{d.name}</option>)}</optgroup>
          </select>
        </label>
        <label className="min-w-56 flex-1 space-y-1 text-xs font-medium text-muted-foreground">Find a position or person
          <span className="relative block"><Search aria-hidden="true" className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
            <Input value={term} onChange={e => setTerm(e.target.value)} placeholder="Type a title or a name…" className="pl-8" /></span>
        </label>
        <div className="flex flex-wrap items-end gap-1.5">
          <Button variant="outline" size="sm" onClick={expandAll}>Expand all</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Collapse all</Button>
          <Button variant="outline" size="icon-sm" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}><Minus /></Button>
          <Button variant="outline" size="sm" aria-label="Zoom to 100%" className="w-14 tabular-nums" onClick={() => zoomBy(1 / zoomRef.current)}>{Math.round(zoom * 100)}%</Button>
          <Button variant="outline" size="icon-sm" aria-label="Zoom in" onClick={() => zoomBy(1.25)}><Plus /></Button>
          <Button variant="outline" size="sm" onClick={() => run({ kind: "fit" })}><Maximize2 /> Fit</Button>
          <Button variant="outline" size="sm" disabled={!position} onClick={() => position && run({ kind: "centre", id: position.id })}><Crosshair /> Centre</Button>
        </div>
      </div>
      {found && <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
        {found.hits.size ? <>
          <span className="rounded-full bg-gemba-lime/25 px-2.5 py-0.5 font-medium text-foreground">{found.hits.size} {found.hits.size === 1 ? "match" : "matches"}</span>
          {matches.length > 1 && <span className="text-muted-foreground tabular-nums">{matchAt + 1} of {matches.length}</span>}
          <Button variant="outline" size="sm" onClick={() => goToMatch(-1)} disabled={!matches.length}><ChevronLeft /> Previous</Button>
          <Button variant="outline" size="sm" onClick={() => goToMatch(matches.length && selected === matches[matchAt] ? 1 : 0)} disabled={!matches.length}>Next <ChevronRight /></Button>
        </> : <span className="text-muted-foreground">Nothing matches. Try another title or name.</span>}
        <Button variant="ghost" size="sm" onClick={() => setTerm("")}><X /> Clear</Button>
      </div>}
      {path.length > 1 && <ReportingLine path={path} current={position!.id} onSelect={select} />}

      <div className="relative">
        <div ref={box} className="h-[64vh] min-h-[400px] overflow-auto rounded-lg border border-border bg-muted/40" style={{ scrollbarGutter: "stable", overscrollBehavior: "contain", overflowAnchor: "none" }}>
          {/* When the whole drawing is narrower than the area (zoomed far out), it sits in the middle rather than at the left. */}
          <div className="relative overflow-hidden" style={{ width: drawWidth * zoom, height: drawHeight * zoom, marginLeft: Math.max(0, Math.floor((area.width - 12 - drawWidth * zoom) / 2)) }}>
            <div className="absolute left-0 top-0" style={{ width: drawWidth, height: drawHeight, transform: `scale(${zoom})`, transformOrigin: "0 0" }}>
              <svg aria-hidden="true" className="pointer-events-none absolute left-0 top-0" width={drawWidth} height={drawHeight}>
                <g className="text-muted-foreground" opacity={0.6}>
                  {tree.lines.map((l, i) => <line key={i} x1={l.x1 + OX} y1={l.y1 + OY} x2={l.x2 + OX} y2={l.y2 + OY} stroke="currentColor" strokeWidth={px(1.75)} />)}
                </g>
                {/* Just opened (last two): lime, dashed. The line down to the selected position: navy. */}
                {recentRoutes.map((pts, i) => <polyline key={`r${i}`} points={pts} fill="none" className="text-gemba-lime" stroke="currentColor" strokeWidth={px(3)} strokeDasharray={`${px(8)} ${px(6)}`} strokeLinejoin="round" />)}
                {showLine && pathRoutes.map((pts, i) => <polyline key={`p${i}`} points={pts} fill="none" className="text-gemba-navy" stroke="currentColor"
                  strokeWidth={px(mode === "FULL" ? 3.5 : 2)} opacity={mode === "FULL" ? 1 : 0.5} strokeLinejoin="round" />)}
              </svg>
              {tree.placed.map(placed => <PositionBox key={placed.position.id} placed={placed} ox={OX} oy={OY} mode={mode} zoom={zoom}
                slot={colours.slotOf(placed.position)} selected={placed.position.id === position?.id} onPath={pathIds.has(placed.position.id)}
                hit={!!found?.hits.size && found.hits.has(placed.position.id)} faded={!lit(placed.position.id) && ((!!found?.hits.size && !found.hits.has(placed.position.id)) || !!view?.context.has(placed.position.id))}
                onSelect={() => select(placed.position.id)} onToggle={() => toggle(placed.position.id)} />)}
            </div>
          </div>
          {!tree.placed.length && <p className="p-8 text-center text-sm text-muted-foreground">{scope.kind === "NOT_CONNECTED" ? "No separate structures: everyone on the chart is connected to the top." : "Nothing to show in this view."}</p>}
        </div>

        {/* The details card floats over the chart on wide screens; on narrow ones it's in the branch panel below. */}
        {!narrow && position && (showDetails
          ? <div className="absolute right-3 top-3 z-20"><PositionDetails position={position} index={index} slot={colours.slotOf(position)} onSelect={select}
              onClose={() => setShowDetails(false)} onZoom={mode !== "FULL" ? zoomToSelected : undefined} floating
              teamOpen={effectiveOpen.has(position.id)} onToggleTeam={() => toggle(position.id)} /></div>
          : <div className="absolute right-3 top-3 z-20"><Button variant="outline" size="sm" className="bg-card shadow-md" onClick={() => setShowDetails(true)}>Details</Button></div>)}
        {position && focusOutOfSight && <Button size="sm" className="absolute bottom-3 right-3 z-20 border-2 border-gemba-navy bg-gemba-navy font-semibold text-white shadow-lg hover:bg-gemba-navy-deep"
          onClick={() => focusPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>In focus below <ArrowDown /></Button>}

      </div>
      <Legend mode={mode} colours={colours} onColourBy={setColourBy} branches={chart.multiBranch} showLine={showLine} onShowLine={setShowLine} />

      {scope.kind === "NOT_CONNECTED" && <div className="rounded-lg border-2 border-gemba-red/40 bg-gemba-red/5 p-4">
        <p className="text-sm font-semibold text-foreground">People left off the chart (to correct in EMS)</p>
        <CheckList checks={chart.checks.filter(c => c.kind !== "NO_JOB_TITLE")} className="mt-2" />
      </div>}

      {/* In focus: the selected position, readable — the line above it, the position, its peers and its team. */}
      {position && <div ref={focusPanel} className="scroll-mt-4">
        <InFocusPanel position={position} index={index} slot={colours.slotOf(position)} slotOf={colours.slotOf} onSelect={select}
          onBack={() => chartTop.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          details={narrow ? <PositionDetails position={position} index={index} slot={colours.slotOf(position)} onSelect={select}
            onClose={() => setSelected(null)} onZoom={mode !== "FULL" ? zoomToSelected : undefined} floating={false}
            teamOpen={effectiveOpen.has(position.id)} onToggleTeam={() => toggle(position.id)} /> : null} />
      </div>}
    </CardContent>
  </Card>;
}

function ReportingLine({ path, current, onSelect }: { path: Position[]; current: string; onSelect: (id: string) => void }) {
  return <nav aria-label="Reporting line" className="flex flex-wrap items-center gap-1 text-sm">
    {path.map((p, i) => <span key={p.id} className="flex items-center gap-1">
      {i > 0 && <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />}
      <button type="button" onClick={() => onSelect(p.id)} className={p.id === current ? "font-semibold text-foreground" : "text-primary underline-offset-2 hover:underline"}>{p.person ? p.person.name : p.title}</button>
    </span>)}
  </nav>;
}

/** What the lines and colours mean. Colours (by department or by branch) show as edges, and as blocks when zoomed out. */
function Legend({ mode, colours, onColourBy, branches, showLine, onShowLine }: {
  mode: CardMode; colours: ReturnType<typeof chartColours>; onColourBy: (by: ColourBy) => void; branches: boolean; showLine: boolean; onShowLine: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(mode !== "FULL");
  useEffect(() => { if (mode !== "FULL") setOpen(true); }, [mode]);
  const noun = colours.by === "DEPARTMENT" ? "Departments" : "Branches";
  // A strip under the chart (never over it), so it can't cover a box in any view.
  return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={showLine} onChange={e => onShowLine(e.target.checked)} className="accent-[var(--color-gemba-navy)]" />
        <span aria-hidden="true" className="h-1 w-6 rounded bg-gemba-navy" />Show selected line</label>
      <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0 w-6 border-t-[3px] border-dashed border-gemba-lime" />Just opened</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1 font-semibold hover:underline">
        {noun} legend {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</button>
      {branches && <span role="group" aria-label="Colour by" className="flex overflow-hidden rounded-md border border-border">
        {(["DEPARTMENT", "BRANCH"] as const).map(by => <button key={by} type="button" aria-pressed={colours.by === by} onClick={() => onColourBy(by)}
          className={cn("px-2 py-0.5", colours.by === by ? "bg-gemba-navy text-white" : "hover:bg-muted")}>{by === "DEPARTMENT" ? "Department" : "Branch"}</button>)}
      </span>}
    </div>
    {open && <div className="mt-1.5 flex max-h-24 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
      {colours.legend.map(g => <span key={g.id} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: `var(--dept-${g.slot})` }} />{g.name} ({g.people})</span>)}
      {colours.other.groups > 0 && <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: "var(--dept-0)" }} />Other ({colours.other.groups})</span>}
    </div>}
  </div>;
}

/**
 * One position (or one person in a shared role), drawn for the zoom: full box (two-line title, department, holder),
 * title only (larger, from 30%), or a coloured block (below 30%; its title shows on hover). Every box keeps a
 * legend-coloured edge. The top position is filled navy; a shared role is a small stack; matches are filled lime.
 */
function PositionBox({ placed, ox, oy, mode, zoom, slot, selected, onPath, hit, faded, onSelect, onToggle }: {
  placed: Placed; ox: number; oy: number; mode: CardMode; zoom: number; slot: number; selected: boolean; onPath: boolean; hit: boolean; faded: boolean;
  onSelect: () => void; onToggle: () => void;
}) {
  const { position: p, x, y, open: isOpen, childCount } = placed;
  const top = !p.parentId, group = p.holders.length > 1 && !p.person, probation = p.holders.filter(h => h.status === "PROBATION").length;
  const label = p.person ? `${p.person.name}, ${p.title}` : `${p.title}${p.unit ? `, ${p.unit.name}` : ""}: ${group ? `${p.holders.length} people` : p.holders[0]?.name ?? "vacant"}`;
  const style = { left: x + ox, top: y + oy, width: BOX.width };
  if (mode === "BLOCK") return <div className={cn("absolute", faded && "opacity-25")} style={style}>
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={label} title={label} className="block w-full rounded-lg"
      style={{ height: BOX.height, background: `var(--dept-${slot})`, outline: selected ? `${Math.ceil(5 / zoom)}px solid var(--dept-${slot})` : hit ? `${Math.ceil(5 / zoom)}px solid var(--color-gemba-lime)` : undefined, outlineOffset: Math.ceil(4 / zoom) }} />
  </div>;
  const sub = top && !hit ? "text-white/75" : "text-muted-foreground";
  return <div className={cn("absolute", faded && "opacity-35")} style={style}>
    {group && mode === "FULL" && <span aria-hidden="true" className="absolute inset-x-2 -bottom-1 h-full rounded-lg border border-border bg-card" />}
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={label}
      className={cn("relative flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        hit ? "border-2 border-gemba-lime-ink bg-gemba-lime/30 text-foreground" : top ? "border-gemba-navy bg-gemba-navy text-white" : "border-border bg-card text-card-foreground",
        !selected && onPath && !hit && "border-gemba-navy")}
      // Every box: a coloured left edge. The selected one: outlined all round in its colour, with a soft glow.
      // (Per-side properties only, so React never mixes a border shorthand with its parts between renders.)
      style={{ height: BOX.height, borderLeftStyle: "solid", borderLeftWidth: mode === "TITLE" ? 10 : 6, borderLeftColor: `var(--dept-${slot})`,
        ...(selected ? (() => { const w = Math.max(3, Math.round(3 / zoom)), c = `var(--dept-${slot})`; return {
          borderTopWidth: w, borderRightWidth: w, borderBottomWidth: w, borderTopColor: c, borderRightColor: c, borderBottomColor: c,
          boxShadow: `0 0 0 ${Math.round(5 / zoom)}px color-mix(in oklab, ${c} 30%, transparent)` }; })() : {}) }}>
      {mode === "TITLE" ? <span className="line-clamp-2 w-full text-2xl font-semibold leading-tight">{p.person ? p.person.name : p.title}</span>
        : p.person ? <>
          <span className="flex w-full items-center gap-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {p.person.name.split(/\s+/).filter(Boolean).map((w, i, a) => i === 0 || i === a.length - 1 ? w[0] : "").join("").toUpperCase()}</span>
            <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.person.name}</span>
          </span>
          <span className="mt-auto flex w-full items-center gap-1.5 text-xs text-muted-foreground"><span className="truncate">{p.title}</span>
            {p.person.status === "PROBATION" && <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold">Prob.</span>}</span>
        </> : <>
          <span className="line-clamp-2 w-full text-sm font-semibold leading-snug">{p.title}</span>
          <span className={cn("w-full truncate text-xs", sub)}>{p.unit ? `${p.unit.name}${p.unit.branch ? ` · ${p.unit.branch}` : ""}` : "No department"}</span>
          <span className={cn("mt-auto flex w-full items-center gap-1.5 text-xs", top && !hit ? "text-white" : "text-foreground")}>
            {group ? <><Users aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{p.holders.length} people hold this role</span></> : p.vacant ? <span className="text-gemba-red-ink">Vacant</span> : <span className="truncate">{p.holders[0]?.name}</span>}
            {probation > 0 && <span className={cn("ml-auto shrink-0 rounded-full px-1.5 text-[10px] font-semibold", top && !hit ? "bg-white/20" : "bg-muted text-muted-foreground")}>{group ? `${probation} prob.` : "Prob."}</span>}
          </span>
        </>}
    </button>
    {/* + / − also in the titles-only view, kept the same size on screen. */}
    {childCount > 0 && <button type="button" onClick={onToggle} aria-expanded={isOpen}
      style={mode === "TITLE" ? { transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "50% 0" } : undefined}
      aria-label={group ? `${isOpen ? "Hide" : "Show"} the ${childCount} people in this role` : `${isOpen ? "Close" : "Open"} the ${childCount} ${childCount === 1 ? "position" : "positions"} reporting to ${p.title}`}
      className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-semibold text-foreground shadow-xs hover:bg-muted">
      {isOpen ? `− ${childCount}` : `+${childCount}`}{group && " people"}</button>}
  </div>;
}

/** Holders, reports to, and the team in words and as a clickable list. Border in the position's legend colour. */
function PositionDetails({ position: p, index, slot, onSelect, onClose, onZoom, floating, teamOpen, onToggleTeam }: {
  position: Position; index: PositionIndex; slot: number; onSelect: (id: string) => void; onClose: () => void; onZoom?: () => void; floating: boolean;
  teamOpen: boolean; onToggleTeam: () => void;
}) {
  const parent = p.parentId ? index.byId.get(p.parentId) : undefined;
  const role = p.person ? parent : undefined, manager = role?.parentId ? index.byId.get(role.parentId) : parent;
  const [all, setAll] = useState(false);
  const holders = all ? p.holders : p.holders.slice(0, 8);
  const team = teamSummary(index, p.id);
  const below = index.childrenOf(p.id).length, shared = p.holders.length > 1 && !p.person;
  const teammates = p.person && role ? index.childrenOf(role.id).filter(x => x.id !== p.id) : [];
  return <Card size="sm" className={cn("border-[3px] shadow-xl", floating && "max-h-[calc(64vh-1.5rem)] w-80 max-w-[calc(100vw-4rem)] overflow-y-auto")} style={{ borderColor: `var(--dept-${slot})` }}>
    <CardHeader>
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary">{p.person ? "Person in a shared role" : p.holders.length > 1 ? "Shared role" : "Position"}</Badge>
        <Button variant="ghost" size="icon-sm" aria-label="Hide details" onClick={onClose}><X /></Button>
      </div>
      <CardTitle className="mt-1">{p.person ? p.person.name : p.title}</CardTitle>
      <CardDescription>{p.person ? p.title : ""}{p.unit && `${p.person ? " · " : ""}${p.unit.name}${p.unit.branch ? ` · ${p.unit.branch}` : ""}`}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      {onZoom && <Button size="sm" className="w-full" onClick={onZoom}><ZoomIn /> Zoom to this position</Button>}
      {/* Open or close the team from here too (handy when zoomed out, where boxes have no + / −). */}
      {below > 0 && <Button variant="outline" size="sm" className="w-full" onClick={onToggleTeam} aria-expanded={teamOpen}>
        {teamOpen ? (shared ? "Hide its people" : "Close its team") : shared ? `Show its ${below} people` : `Open its team (${below})`}</Button>}
      {!p.person && <div>
        <p className="text-xs font-medium text-muted-foreground">{p.holders.length > 1 ? `Held by ${p.holders.length} people` : "Held by"}</p>
        <ul className="mt-1 space-y-0.5">{holders.map(h => <li key={h.employeeId} className="flex items-center justify-between gap-2">
          <span className="truncate">{h.name}</span>{h.status === "PROBATION" && <Badge variant="outline">Probation</Badge>}</li>)}</ul>
        {p.holders.length > 8 && <button type="button" onClick={() => setAll(v => !v)} className="mt-1 text-xs text-primary hover:underline">{all ? "Show fewer" : `Show all ${p.holders.length}`}</button>}
      </div>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {p.person && <><dt className="text-muted-foreground">Status</dt><dd>{p.person.status === "PROBATION" ? "On probation" : "Active"}</dd></>}
        <dt className="text-muted-foreground">Reports to</dt>
        <dd>{manager ? <button type="button" onClick={() => onSelect(manager.id)} className="text-left text-primary hover:underline">{manager.title}{manager.holders.length === 1 && ` · ${manager.holders[0].name}`}</button> : "Top of the organisation"}</dd>
        {!p.person && <><dt className="text-muted-foreground">Team</dt>
          <dd>{team.positions ? <>
            {team.direct} {team.direct === 1 ? "person" : "people"} in {team.positions} {team.positions === 1 ? "position" : "positions"}{team.sharedRoles > 0 && `, ${team.sharedRoles} shared ${team.sharedRoles === 1 ? "role" : "roles"}`}
            <span className="block text-xs text-muted-foreground">{team.below} in total below{team.probation > 0 && ` · ${team.probation} on probation`}</span>
          </> : "Nobody reports to this position"}</dd></>}
      </dl>
      {!p.person && team.positions > 0 && <ul className="space-y-1 border-t border-border pt-2">
        {team.team.map(t => { const own = teamSummary(index, t.id); return <li key={t.id}>
          <button type="button" onClick={() => onSelect(t.id)} className="w-full text-left hover:underline">
            <span className="font-medium text-foreground">{t.title}</span>
            <span className="text-muted-foreground"> · {t.holders.length > 1 ? `${t.holders.length} people` : t.holders[0]?.name}{own.positions > 0 && ` · team of ${own.below}`}</span>
          </button></li>; })}
      </ul>}
      {teammates.length > 0 && <div className="border-t border-border pt-2">
        <p className="text-xs font-medium text-muted-foreground">Also in this role ({teammates.length})</p>
        <ul className="mt-1 flex flex-wrap gap-1.5">{teammates.map(t => <li key={t.id}>
          <button type="button" onClick={() => onSelect(t.id)} className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted">
            {t.person!.name}{t.person!.status === "PROBATION" && " · prob."}</button></li>)}</ul>
      </div>}
      <p className="text-xs text-muted-foreground">Worked out from job titles and reporting lines. Vacancies and acting cover come with position records in EMS.</p>
    </CardContent>
  </Card>;
}

/**
 * In focus, below the chart: the selected position's reporting line, the position itself, its peers (for a person in a
 * shared role: the others in that role) and its team, as readable cards that wrap to the width. It updates in place;
 * "In focus below ↓" in the chart glides here. ("In focus" rather than "branch": in BEES a branch is a site.)
 */
function InFocusPanel({ position: p, index, slot, slotOf, onSelect, onBack, details }: {
  position: Position; index: PositionIndex; slot: number; slotOf: (p: Position) => number; onSelect: (id: string) => void; onBack: () => void; details: ReactNode;
}) {
  const path = index.pathTo(p.id);
  const parent = p.parentId ? index.byId.get(p.parentId) : undefined;
  const peers = parent ? index.childrenOf(parent.id).filter(x => x.id !== p.id && !!x.person === !!p.person) : [];
  const team = p.person ? [] : index.childrenOf(p.id);
  const card = (x: Position) => <button key={x.id} type="button" onClick={() => onSelect(x.id)}
    className="flex min-h-20 w-full flex-col items-start rounded-lg border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
    style={{ borderLeft: `6px solid var(--dept-${slotOf(x)})` }}>
    <span className="font-semibold text-foreground">{x.person ? x.person.name : x.title}</span>
    <span className="text-xs text-muted-foreground">{x.person ? x.title : x.holders.length > 1 ? `${x.holders.length} people hold this role` : x.holders[0]?.name}</span>
    {!x.person && index.childrenOf(x.id).length > 0 && <span className="mt-auto text-xs text-muted-foreground">Team of {teamSummary(index, x.id).below}</span>}
  </button>;
  return <section aria-label="In focus" className="space-y-3 rounded-lg border border-border bg-card p-4" style={{ borderTop: `4px solid var(--dept-${slot})` }}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-bold text-gemba-navy dark:text-foreground">In focus · {p.person ? p.person.name : p.title}</h3>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowUp className="size-4" /> Back to chart</button>
    </div>
    {path.length > 1 && <ReportingLine path={path} current={p.id} onSelect={onSelect} />}
    {details}
    {peers.length > 0 && <div className="text-sm">
      <p className="text-xs font-medium text-muted-foreground">{p.person ? `Also in this role (${peers.length})` : `Also reporting to ${parent!.title}`}</p>
      {p.person ? <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{peers.map(card)}</div>
        : <div className="mt-1 flex flex-wrap gap-1.5">{peers.map(x => <button key={x.id} type="button" onClick={() => onSelect(x.id)}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-muted">{x.title}{x.holders.length === 1 ? ` · ${x.holders[0].name}` : ` · ${x.holders.length} people`}</button>)}</div>}
    </div>}
    <div>
      <p className="text-xs font-medium text-muted-foreground">{p.holders.length > 1 && !p.person ? `The ${team.length} people in this role` : team.length ? `Team · ${team.length} ${team.length === 1 ? "position" : "positions"}` : "No team"}</p>
      {team.length > 0 && <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{team.map(card)}</div>}
    </div>
  </section>;
}
