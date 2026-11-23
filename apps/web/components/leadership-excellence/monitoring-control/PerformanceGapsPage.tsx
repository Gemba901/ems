"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, X } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getMonitoringSettings, getPerformance, getPerformanceDetail, updateMonitoringSettings } from "@/services/leadership-excellence/monitoring-control.service";
import { DataPill, Empty, ErrorBox, Filters, HowTo, Loading, PageHeader, PerformancePill, Pill, fmt, periodLabel, pretty, targetLabel, useDirectory } from "./shared";
import type { AssignmentSummary, KpiDirection, MonitoringFilters } from "./types";

const DIRECTION: Record<KpiDirection, string> = {
  higher: "Higher is better",
  lower: "Lower is better",
  range: "Stay within the range",
  zero: "Target is zero",
};

/** 05.02 · Performance status & gap analysis: verified results against their targets. */
export function PerformanceGapsPage() {
  const { accessToken, user } = useAuthStore();
  const [filters, setFilters] = useState<MonitoringFilters>({});
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["lex05-performance", user?.organizationId, filters],
    queryFn: ({ signal }) => getPerformance(accessToken!, filters, signal),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader code="05.02 · Performance status & gap analysis" title="See results, gaps and completeness."
        lead="Only verified results count. Periods are compared like for like, and whether a gap is good or bad depends on the KPI's direction." />
      <HowTo>
        <p><strong className="text-foreground">What is it?</strong> Every KPI you can see, with its verified result, target and gap so far.</p>
        <p><strong className="text-foreground">How to read it:</strong> quantities are added up, rates are recalculated from their combined inputs, and closing values use the latest period. When a due period is not yet verified, the summary is marked incomplete and no gap is shown.</p>
        <p><strong className="text-foreground">How to use:</strong> select a KPI to see every period, its evidence and its data status. Use Up to month to see the position at the end of an earlier month.</p>
        <p><strong className="text-foreground">Needs attention:</strong> a miss within the warning band below is amber; a bigger miss is red. A KPI&apos;s own tolerance from its plan takes priority.</p>
        <p><strong className="text-foreground">Next:</strong> open 05.03 · Alerts &amp; Follow-up for the KPIs that need action.</p>
      </HowTo>
      <Filters value={filters} onChange={setFilters} monthLabel="Up to month" />
      <WarningBand />
      {list.isPending ? <Loading label="Loading performance…" />
        : list.error ? <ErrorBox error={list.error} />
        : !list.data.length ? <Empty>No approved KPIs in this view yet. KPIs appear once their plans are approved in Key Functional Area 3.</Empty>
        : <>
          <Totals rows={list.data} />
          <Card>
            <CardHeader><CardTitle>KPIs</CardTitle><CardDescription>{list.data.length} in this view</CardDescription></CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[60rem] text-left text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">KPI</th><th className="p-3">Department / owner</th><th className="p-3">Target so far</th>
                      <th className="p-3">Verified actual</th><th className="p-3">Gap</th><th className="p-3">Status</th><th className="p-3">Data</th><th className="p-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.data.map(r => <Row key={r.assignmentId} row={r} active={open === r.assignmentId} onOpen={() => setOpen(r.assignmentId)} />)}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>}
      {open && <Detail assignmentId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The organisation's "needs attention" band. Admin and management can change it. */
function WarningBand() {
  const { accessToken, user } = useAuthStore();
  const client = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const settings = useQuery({
    queryKey: ["lex05-settings", user?.organizationId],
    queryFn: ({ signal }) => getMonitoringSettings(accessToken!, signal),
    enabled: !!accessToken,
  });
  const save = useMutation({
    mutationFn: (pct: number) => updateMonitoringSettings(accessToken!, pct),
    onSuccess: data => {
      client.setQueryData(["lex05-settings", user?.organizationId], data);
      void client.invalidateQueries({ queryKey: ["lex05-performance"] });
      void client.invalidateQueries({ queryKey: ["lex05-alerts"] });
      setDraft(null);
    },
  });
  if (!settings.data) return null;
  const pct = Number(draft);
  const valid = draft !== null && draft.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct <= 50;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Warning band:</span>
      {draft === null ? <>
        <span className="font-medium">{settings.data.warningTolerancePct > 0 ? `within ${settings.data.warningTolerancePct}% of target` : "off (every miss is below target)"}</span>
        {settings.data.canEdit && <Button size="sm" variant="ghost" onClick={() => setDraft(String(settings.data.warningTolerancePct))}>Change</Button>}
      </> : <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (valid) save.mutate(pct); }}>
        <label className="sr-only" htmlFor="lex05-band">Warning band, % of target</label>
        <Input id="lex05-band" type="number" min={0} max={50} step={0.5} className="h-8 w-24" value={draft} onChange={e => setDraft(e.target.value)} />
        <span className="text-muted-foreground">% of target (0 turns it off)</span>
        <Button size="sm" type="submit" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => { setDraft(null); save.reset(); }}>Cancel</Button>
        {save.error && <span role="alert" className="text-destructive">{save.error.message}</span>}
      </form>}
    </div>
  );
}

function Totals({ rows }: { rows: AssignmentSummary[] }) {
  const count = (s: string) => rows.filter(r => r.assessment?.status === s).length;
  const incomplete = rows.filter(r => r.summary.incomplete).length;
  const tiles = [
    { label: "On target", value: count("ON_TARGET"), tone: "text-gemba-lime-ink" },
    { label: "Needs attention", value: count("NEEDS_ATTENTION"), tone: "text-amber-700" },
    { label: "Below target", value: count("BELOW_TARGET"), tone: "text-gemba-red-ink" },
    { label: "Incomplete data", value: incomplete, tone: "text-muted-foreground" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map(t => (
        <Card key={t.label} size="sm"><CardContent>
          <p className="text-xs text-muted-foreground">{t.label}</p>
          <p className={cn("text-2xl font-semibold", t.tone)}>{t.value}</p>
        </CardContent></Card>
      ))}
    </div>
  );
}

function Row({ row: r, active, onOpen }: { row: AssignmentSummary; active: boolean; onOpen: () => void }) {
  const { person, department } = useDirectory();
  const gap = r.variance;
  return (
    <tr className={cn("cursor-pointer hover:bg-muted/40", active && "bg-gemba-navy/5")} onClick={onOpen}>
      <td className="p-3"><span className="block text-xs font-medium text-muted-foreground">{r.code}</span><span className="font-medium text-foreground">{r.name}</span></td>
      <td className="p-3">{department(r.departmentId)}<span className="block text-xs text-muted-foreground">{person(r.ownerId)}</span></td>
      <td className="p-3">{fmt(r.summary.target)} <span className="text-xs text-muted-foreground">{r.unit}</span></td>
      <td className="p-3">{fmt(r.summary.actual)} <span className="text-xs text-muted-foreground">{r.unit}</span>
        {r.achievementPct !== null && <span className="block text-xs text-muted-foreground">{fmt(r.achievementPct, 1)}% of target</span>}</td>
      <td className={cn("p-3", gap?.favourable === true && "text-gemba-lime-ink", gap?.favourable === false && "text-gemba-red-ink")}>
        {gap ? `${gap.value > 0 ? "+" : ""}${fmt(gap.value)}` : "—"}</td>
      <td className="p-3"><PerformancePill status={r.assessment?.status} /></td>
      <td className="p-3 text-xs text-muted-foreground">
        {r.completeness.verified}/{r.completeness.due} verified
        {r.completeness.pending > 0 && <span className="block text-amber-800">{r.completeness.pending} awaiting verification</span>}
      </td>
      <td className="p-3"><Button variant="ghost" size="icon" aria-label={`Open ${r.code}`} onClick={onOpen}><ChevronRight /></Button></td>
    </tr>
  );
}

function Detail({ assignmentId, onClose }: { assignmentId: string; onClose: () => void }) {
  const { accessToken, user } = useAuthStore();
  const { person, department } = useDirectory();
  const detail = useQuery({
    queryKey: ["lex05-performance", user?.organizationId, "detail", assignmentId],
    queryFn: ({ signal }) => getPerformanceDetail(accessToken!, assignmentId, signal),
    enabled: !!accessToken,
  });
  const d = detail.data;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardDescription>{d ? `${d.code} · ${DIRECTION[d.direction]}` : "KPI"}</CardDescription>
          <CardTitle>{d?.name ?? "Loading…"}</CardTitle>
          {d && <CardDescription>{department(d.departmentId)} · owner {person(d.ownerId)} · verifier {person(d.verifierId)}</CardDescription>}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close KPI" onClick={onClose}><X /></Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {detail.isPending ? <Loading label="Loading periods…" />
          : detail.error ? <ErrorBox error={detail.error} />
          : d && <>
            {d.summary.incomplete && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Some due periods are not verified yet, so no overall gap is shown. Read the periods below.</p>}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr><th className="p-3">Period</th><th className="p-3">Due</th><th className="p-3">Target</th><th className="p-3">Verified actual</th>
                    <th className="p-3">Gap</th><th className="p-3">Performance</th><th className="p-3">Data</th><th className="p-3">Evidence</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {d.periods.map(p => (
                    <tr key={p.periodId}>
                      <td className="p-3">{periodLabel(p.start, p.end)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{pretty(p.dueAt)}</td>
                      <td className="p-3">{targetLabel(p.target, p.upper)}</td>
                      <td className="p-3">{fmt(p.actual)}
                        {p.revision !== null && p.revision > 1 && <span className="block text-xs text-muted-foreground">revision {p.revision}</span>}
                        {p.correctionPending && <span className="block text-xs text-amber-800">correction awaiting verification</span>}</td>
                      <td className="p-3">{p.assessment ? fmt(p.assessment.gap) : "—"}</td>
                      <td className="p-3">{p.assessment ? <PerformancePill status={p.assessment.status} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3"><DataPill status={p.dataStatus} /></td>
                      <td className="p-3 text-xs text-muted-foreground">{p.evidence ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Baseline to target progress: {d.improvementProgressPct === null ? "not available" : `${fmt(d.improvementProgressPct, 1)}%`}.
              {" "}No appraisal score is calculated here. <Pill tone="gray">Read-only</Pill>
            </p>
          </>}
      </CardContent>
    </Card>
  );
}
