"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MonitoringError,
  checkAction,
  getActionChecks,
  getVerificationHistory,
  getVerificationQueue,
  returnResults,
  verifyResults,
} from "@/services/leadership-excellence/monitoring-control.service";
import { Empty, ErrorBox, Filters, HowTo, Loading, NoteDialog, PageHeader, Pill, fmt, periodLabel, targetLabel, useDirectory, when } from "./shared";
import type { MonitoringFilters, PendingActionCheck, QueueRow, RowFailure } from "./types";

type Decision = "verify" | "return";

/** 05.01 · KPI data verification: the assigned verifier makes submitted results official, or returns them. */
export function VerifyResultsPage() {
  const { accessToken, user } = useAuthStore();
  const [filters, setFilters] = useState<MonitoringFilters>({});
  const queue = useQuery({
    queryKey: ["lex05-queue", user?.organizationId, filters],
    queryFn: ({ signal }) => getVerificationQueue(accessToken!, filters, signal),
    enabled: !!accessToken,
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader code="05.01 · KPI data verification & measurement" title="Check the facts. Verify once."
        lead="These results were entered in Key Functional Area 4. Only the assigned verifier can make them official." />
      <HowTo>
        <p><strong className="text-foreground">What is it?</strong> Results waiting for you, as the assigned verifier, to check against their evidence.</p>
        <p><strong className="text-foreground">How to use:</strong> select the rows that are ready and choose Verify, or Return with a reason so the provider can correct them. A row with a problem cannot be verified until it is fixed.</p>
        <p><strong className="text-foreground">What happens:</strong> a verified value becomes the official result used in 05.02 and later areas. A correction keeps the old official value until the new one is verified.</p>
        <p><strong className="text-foreground">Actions:</strong> delivery actions their owners marked done also wait here for a completion check. Accept them, or send them back with what is still missing.</p>
        <p><strong className="text-foreground">Next:</strong> open 05.02 · Performance &amp; Gaps to see how the verified results compare with their targets.</p>
      </HowTo>
      <Filters value={filters} onChange={setFilters} monthLabel="Period ending in" />
      {queue.isPending ? <Loading label="Loading results…" />
        : queue.error ? <ErrorBox error={queue.error} />
        : <Queue rows={queue.data} />}
      <ActionChecks />
      <History filters={filters} />
    </div>
  );
}

function Queue({ rows }: { rows: QueueRow[] }) {
  const { accessToken } = useAuthStore();
  const { person } = useDirectory();
  const client = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<Decision | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ready = useMemo(() => rows.filter(r => !r.problems.length), [rows]);
  const selected = rows.filter(r => picked.has(r.submissionId));
  const allPicked = ready.length > 0 && ready.every(r => picked.has(r.submissionId));
  const toggle = (id: string) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const mutation = useMutation({
    mutationFn: ({ kind, note }: { kind: Decision; note: string }) => {
      const ids = selected.map(r => r.submissionId);
      return kind === "verify"
        ? verifyResults(accessToken!, ids, note).then(r => r.verified)
        : returnResults(accessToken!, ids, note).then(r => r.returned);
    },
    onSuccess: (n, { kind }) => {
      setDone(`${n} result${n === 1 ? "" : "s"} ${kind === "verify" ? "verified" : "returned for correction"}.`);
      setPicked(new Set());
      setDecision(null);
      void client.invalidateQueries({ queryKey: ["lex05-queue"] });
      void client.invalidateQueries({ queryKey: ["lex05-history"] });
      void client.invalidateQueries({ queryKey: ["lex05-performance"] });
    },
    // Area 04 saves one result at a time, so a refusal can come after some were saved.
    onError: () => {
      void client.invalidateQueries({ queryKey: ["lex05-queue"] });
      void client.invalidateQueries({ queryKey: ["lex05-history"] });
    },
  });
  const failures: RowFailure[] = mutation.error instanceof MonitoringError ? mutation.error.failures : [];
  const codeOf = (id: string) => { const r = rows.find(x => x.submissionId === id); return r ? `${r.code} · ${periodLabel(r.periodStart, r.periodEnd)}` : id; };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Results awaiting your verification</CardTitle>
        <CardDescription>{rows.length} submitted · {ready.length} ready to verify</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {done && <p role="status" className="rounded-md border border-gemba-lime/40 bg-gemba-lime/10 p-3 text-sm text-gemba-lime-ink">{done}</p>}
        {!rows.length ? <Empty>Nothing is waiting for you to verify. Results appear here once their provider submits them in Key Functional Area 4.</Empty> : <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 p-3"><input type="checkbox" aria-label="Select all results that are ready" checked={allPicked} disabled={!ready.length}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(ready.map(r => r.submissionId)))} /></th>
                  <th className="p-3">KPI &amp; period</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Submitted result</th>
                  <th className="p-3">Submitted by / evidence</th>
                  <th className="p-3">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(r => (
                  <tr key={r.submissionId} className={picked.has(r.submissionId) ? "bg-gemba-navy/5" : undefined}>
                    <td className="p-3 align-top"><input type="checkbox" aria-label={`Select ${r.code} ${periodLabel(r.periodStart, r.periodEnd)}`}
                      disabled={!!r.problems.length} checked={picked.has(r.submissionId)} onChange={() => toggle(r.submissionId)} /></td>
                    <td className="p-3 align-top">
                      <span className="block text-xs font-medium text-muted-foreground">{r.code}</span>
                      <span className="block font-medium text-foreground">{r.name}</span>
                      <span className="block text-xs text-muted-foreground">{periodLabel(r.periodStart, r.periodEnd)}</span>
                    </td>
                    <td className="p-3 align-top">{targetLabel(r.target, r.upper)} <span className="text-xs text-muted-foreground">{r.unit}</span></td>
                    <td className="p-3 align-top">
                      <span className="font-semibold">{fmt(r.actual)}</span> <span className="text-xs text-muted-foreground">{r.unit}</span>
                      {r.inputB !== null && <span className="block text-xs text-muted-foreground">{fmt(r.inputA)} ÷ {fmt(r.inputB)}</span>}
                      {r.isCorrection && <span className="block text-xs text-amber-800">Correction · current official {fmt(r.currentOfficial)}{r.correctionReason ? ` · ${r.correctionReason}` : ""}</span>}
                    </td>
                    <td className="p-3 align-top">
                      <span className="block">{person(r.submittedById)}</span>
                      <span className="block text-xs text-muted-foreground">{when(r.submittedAt)}</span>
                      <span className="block text-xs text-muted-foreground">{r.evidence || "No evidence given"}</span>
                      {r.note && <span className="block text-xs italic text-muted-foreground">“{r.note}”</span>}
                    </td>
                    <td className="p-3 align-top">
                      {r.problems.length
                        ? <ul className="space-y-1 text-xs text-gemba-red-ink">{r.problems.map(p => <li key={p}>{p}</li>)}</ul>
                        : <Pill tone="green">Ready</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!selected.length} onClick={() => { mutation.reset(); setDecision("verify"); }}><CheckCircle2 /> Verify selected</Button>
            <Button variant="outline" disabled={!selected.length} onClick={() => { mutation.reset(); setDecision("return"); }}><RotateCcw /> Return selected</Button>
            {selected.length > 0 && <Button variant="ghost" onClick={() => setPicked(new Set())}>Clear selection</Button>}
            <span className="text-sm text-muted-foreground">{selected.length} selected</span>
          </div>
        </>}
      </CardContent>
      {decision && (
        <NoteDialog
          title={decision === "verify" ? `Verify ${selected.length} result${selected.length === 1 ? "" : "s"}` : `Return ${selected.length} result${selected.length === 1 ? "" : "s"}`}
          description={decision === "verify"
            ? "These values become the official results. If any row fails a check, nothing is verified."
            : "The provider will see your reason and can correct and resubmit in Key Functional Area 4."}
          label={decision === "verify" ? "Note" : "Explain what must be corrected"}
          required={decision === "return"}
          confirm={decision === "verify" ? "Verify" : "Return for correction"}
          busy={mutation.isPending}
          error={mutation.error && (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <p>{mutation.error.message}</p>
              {failures.length > 0 && <ul className="mt-1 list-disc pl-5">{failures.map(f => <li key={f.submissionId}>{codeOf(f.submissionId)}: {f.problems.join(" ")}</li>)}</ul>}
            </div>
          )}
          onConfirm={note => mutation.mutate({ kind: decision, note })}
          onClose={() => setDecision(null)}
        />
      )}
    </Card>
  );
}

type CheckDecision = { row: PendingActionCheck; kind: "COMPLETE" | "RETURN" };

/** Actions their owners marked done; the caller checks whether they really are. */
function ActionChecks() {
  const { accessToken, user } = useAuthStore();
  const { person } = useDirectory();
  const client = useQueryClient();
  const [open, setOpen] = useState<CheckDecision | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const checks = useQuery({
    queryKey: ["lex05-action-checks", user?.organizationId],
    queryFn: ({ signal }) => getActionChecks(accessToken!, signal),
    enabled: !!accessToken,
  });
  const mutation = useMutation({
    mutationFn: ({ row, kind, note }: CheckDecision & { note: string }) => checkAction(accessToken!, row.id, kind, note),
    onSuccess: (_a, { row, kind }) => {
      setDone(`${row.title}: ${kind === "COMPLETE" ? "completion accepted" : "sent back to the owner"}.`);
      setOpen(null);
      void client.invalidateQueries({ queryKey: ["lex05-action-checks"] });
      void client.invalidateQueries({ queryKey: ["lex05-alerts"] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions ready for a completion check</CardTitle>
        <CardDescription>Delivery actions whose owner says they are done. Check the evidence before accepting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {done && <p role="status" className="rounded-md border border-gemba-lime/40 bg-gemba-lime/10 p-3 text-sm text-gemba-lime-ink">{done}</p>}
        {checks.isPending ? <Loading label="Loading actions…" />
          : checks.error ? <ErrorBox error={checks.error} />
          : !checks.data.length ? <Empty>No actions are waiting for your check. They appear here when an owner marks one done in Key Functional Area 4.</Empty>
          : <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr><th className="p-3">Action</th><th className="p-3">Owner</th><th className="p-3">Due</th><th className="p-3">Owner&apos;s note / evidence</th><th className="p-3"><span className="sr-only">Decision</span></th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {checks.data.map(a => (
                  <tr key={`${a.documentId ?? ""}/${a.id}`}>
                    <td className="p-3 align-top font-medium text-foreground">{a.title}</td>
                    <td className="p-3 align-top">{person(a.ownerId)}<span className="block text-xs text-muted-foreground">marked done {when(a.updatedAt)}</span></td>
                    <td className="p-3 align-top">{new Date(a.dueAt).toLocaleDateString()}</td>
                    <td className="p-3 align-top">
                      {a.ownerNote && <span className="block">{a.ownerNote}</span>}
                      <span className="block text-xs text-muted-foreground">{a.evidence || "No evidence given"}</span>
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" onClick={() => { mutation.reset(); setOpen({ row: a, kind: "COMPLETE" }); }}><CheckCircle2 /> Accept</Button>
                        <Button size="sm" variant="outline" onClick={() => { mutation.reset(); setOpen({ row: a, kind: "RETURN" }); }}><RotateCcw /> Send back</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </CardContent>
      {open && (
        <NoteDialog
          title={open.kind === "COMPLETE" ? "Accept completion" : "Send back to the owner"}
          description={<><span className="font-medium text-foreground">{open.row.title}</span> · {person(open.row.ownerId)}</>}
          label={open.kind === "COMPLETE" ? "Note" : "What still needs to be done"}
          required={open.kind === "RETURN"}
          confirm={open.kind === "COMPLETE" ? "Accept" : "Send back"}
          busy={mutation.isPending}
          error={mutation.error && <ErrorBox error={mutation.error} />}
          onConfirm={note => mutation.mutate({ ...open, note })}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

function History({ filters }: { filters: MonitoringFilters }) {
  const { accessToken, user } = useAuthStore();
  const { person } = useDirectory();
  const history = useQuery({
    queryKey: ["lex05-history", user?.organizationId, filters],
    queryFn: ({ signal }) => getVerificationHistory(accessToken!, filters, signal),
    enabled: !!accessToken,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verified &amp; returned history</CardTitle>
        <CardDescription>Every decision is kept, including who made it and the value before a correction.</CardDescription>
      </CardHeader>
      <CardContent>
        {history.isPending ? <Loading label="Loading history…" />
          : history.error ? <ErrorBox error={history.error} />
          : !history.data.length ? <Empty>No verified or returned results in this view yet.</Empty>
          : <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr><th className="p-3">KPI</th><th className="p-3">Decision</th><th className="p-3">Value</th><th className="p-3">By</th><th className="p-3">Reason / note</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.data.map(h => (
                  <tr key={h.id}>
                    <td className="p-3"><span className="block text-xs font-medium text-muted-foreground">{h.code}</span>{h.name}</td>
                    <td className="p-3">{h.action === "VERIFIED" ? <Pill tone="green">{h.previousActual !== null ? "Correction verified" : "Verified"}</Pill> : <Pill tone="amber">Returned</Pill>}</td>
                    <td className="p-3">{fmt(h.actual)}{h.previousActual !== null && <span className="block text-xs text-muted-foreground">was {fmt(h.previousActual)}</span>}</td>
                    <td className="p-3">{person(h.actorId)}<span className="block text-xs text-muted-foreground">{when(h.createdAt)}</span></td>
                    <td className="p-3 text-muted-foreground">{h.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </CardContent>
    </Card>
  );
}
