"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { WorkflowDialog } from "@/components/five-s/WorkflowDialog";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { useFiveSArea, useUpdateArea } from "@/hooks/five-s/useFiveS";
import { useToast } from "@/contexts/toast.context";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { formatLevel } from "@/lib/five-s/scoring";
import { AUDIT_FREQUENCY_LABELS } from "@/services/five-s.service";
import { AreaForm } from "@/components/five-s/areas/AreaForm";
import {
  ActionStatusBadge,
  AuditDueBadge,
  AuditStatusBadge,
  DueDate,
  HEADER_ACTIONS,
  KeyValue,
  LevelValue,
  PracticeBadge,
  SampleBadge,
  TargetBadge,
  errorMessage,
  formatDate,
  formatTimestamp,
} from "@/components/five-s/ui";

export default function AreaDetailPage() {
  const { areaId } = useParams<{ areaId: string }>();
  const { data: area, isLoading, error } = useFiveSArea(areaId);
  const update = useUpdateArea();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <LoadingState label="Loading area…" />;
  if (error || !area) return <ErrorState description={errorMessage(error, "Area not found")} />;

  const latest = area.latest;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-section">
      <Link href="/five-s/areas" className={buttonVariants({ variant: "ghost" })}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Workplace areas
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{area.name}</h1>
            {area.isSample && <SampleBadge />}
            {!area.isActive && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground" title="No current employee profile lists this as their work area">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {area.department?.name ?? "No department"} · Owner: {area.owner?.name ?? "not set"} · {AUDIT_FREQUENCY_LABELS[area.auditFrequency]} audits
          </p>
        </div>
        <div className={HEADER_ACTIONS}>
          {area.permissions.canEdit && (
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit settings
            </Button>
          )}
          {area.permissions.canAudit && (
            <Link href={`/five-s/audits/new?areaId=${area.id}`} className={buttonVariants()}>
              Start an audit
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-section">
          <Card className="block p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Latest submitted audit</h2>
                <p className="text-xs text-muted-foreground">{area.method}</p>
              </div>
              {latest && (
                <Link href={`/five-s/audits/${latest.id}`} className={buttonVariants({ variant: "ghost" })}>
                  {latest.reference} · {formatDate(latest.auditDate)}
                </Link>
              )}
            </div>
            {!latest ? (
              <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
                <span className="font-semibold">Not assessed.</span> This area has no submitted audit yet.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Current level</p>
                    <LevelValue level={latest.level} className="text-2xl" />
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Target</p>
                    <p className="text-2xl font-semibold tabular-nums">{formatLevel(area.targetLevel)}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Abnormality points</p>
                    <p className="text-2xl font-semibold tabular-nums">{latest.totalPoints}</p>
                  </div>
                  <div className="flex items-center rounded-lg bg-muted p-3">
                    <TargetBadge met={area.targetMet} />
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-5 gap-2 text-center">
                  {PRACTICE_ORDER.map((p) => (
                    <div key={p} className="rounded-lg border border-border p-2">
                      <dt className="truncate text-[11px] text-muted-foreground">{PRACTICE_LABELS[p]}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{latest.points[p]}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {area.otherMethodAuditCount > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {area.otherMethodAuditCount} audit(s) made with a different assessment method are kept separately and not compared here.
              </p>
            )}
          </Card>

          {area.drafts.length > 0 && (
            <Card className="block border-dashed border-warning bg-warning-subtle/40">
              <div className="border-b border-warning px-5 py-3">
                <h2 className="text-base font-semibold text-foreground">Draft audits</h2>
                <p className="text-xs text-muted-foreground">Not submitted. Drafts never count towards results.</p>
              </div>
              <ul className="divide-y divide-warning">
                {area.drafts.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <Link href={`/five-s/audits/${d.id}`} className="font-medium text-info hover:underline">
                        {d.reference}
                      </Link>{" "}
                      <AuditStatusBadge status="DRAFT" />
                      <p className="text-xs text-muted-foreground">
                        {formatDate(d.auditDate)} · {d.auditor?.name ?? "—"} · {d.answered}/20 answered · saved {formatTimestamp(d.updatedAt)}
                      </p>
                    </div>
                    <Link href={`/five-s/audits/${d.id}`} className={buttonVariants({ variant: "outline" })}>
                      Resume
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="block py-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-foreground">Outstanding actions</h2>
              <Link href={`/five-s/actions?areaId=${area.id}`} className={buttonVariants({ variant: "ghost" })}>
                All actions
              </Link>
            </div>
            {area.outstandingActions.length === 0 ? (
              <EmptyState title="No outstanding actions" />
            ) : (
              <ul className="divide-y divide-border">
                {area.outstandingActions.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/five-s/actions/${a.id}`} className="font-medium text-info hover:underline">
                        {a.reference}
                      </Link>
                      <PracticeBadge practice={a.practice} />
                      <ActionStatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-foreground">{a.finding}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Owner: {a.owner?.name ?? "not assigned"} · <DueDate date={a.dueDate} overdue={a.status === "OPEN" && !!a.dueDate && a.dueDate < today} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="block py-0">
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-foreground">Previous results</h2>
            </div>
            {area.history.length === 0 ? (
              <EmptyState title="No submitted audits yet" />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-full text-sm">
                  <TableHeader className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <TableRow>
                      <TableHead className="px-4 py-2">Date</TableHead>
                      <TableHead className="px-3 py-2">Audit</TableHead>
                      {PRACTICE_ORDER.map((p) => (
                        <TableHead key={p} className="px-2 py-2 text-right">
                          {PRACTICE_LABELS[p]}
                        </TableHead>
                      ))}
                      <TableHead className="px-3 py-2 text-right">Total</TableHead>
                      <TableHead className="px-3 py-2">Level</TableHead>
                      <TableHead className="px-3 py-2">Target then</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border">
                    {area.history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap px-4 py-2">{formatDate(h.auditDate)}</TableCell>
                        <TableCell className="px-3 py-2">
                          <Link href={`/five-s/audits/${h.id}`} className="text-info hover:underline">
                            {h.reference}
                          </Link>
                        </TableCell>
                        {PRACTICE_ORDER.map((p) => (
                          <TableCell key={p} className="px-2 py-2 text-right tabular-nums">
                            {h.points[p]}
                          </TableCell>
                        ))}
                        <TableCell className="px-3 py-2 text-right font-semibold tabular-nums">{h.totalPoints}</TableCell>
                        <TableCell className="px-3 py-2">
                          <LevelValue level={h.level} />
                        </TableCell>
                        <TableCell className="px-3 py-2">
                          <span className="mr-2 tabular-nums">{h.targetLevel == null ? "—" : formatLevel(h.targetLevel)}</span>
                          <TargetBadge met={h.targetMet} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-section">
          <Card className="block p-5">
            <dl className="space-y-3">
              <KeyValue label="Audit schedule">
                {area.isActive ? <AuditDueBadge state={area.auditDue.state} nextDueDate={area.auditDue.nextDueDate} /> : "Not scheduled (inactive)"}
              </KeyValue>
              <KeyValue label="Description">{area.description || <span className="text-muted-foreground">None</span>}</KeyValue>
            </dl>
          </Card>
          <Card className="block p-5">
            <h2 className="text-sm font-semibold text-foreground">In this area</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between">
                <Link href={`/five-s/red-tags?areaId=${area.id}`} className="text-info hover:underline">
                  Pending red tags
                </Link>
                <span className="tabular-nums">{area.counts.pendingRedTags}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/actions?areaId=${area.id}&view=no_due_date`} className="text-info hover:underline">
                  Actions with due date not set
                </Link>
                <span className="tabular-nums">{area.counts.noDueDate}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/standards?areaId=${area.id}`} className="text-info hover:underline">
                  Approved standards
                </Link>
                <span className="tabular-nums">{area.approvedStandards}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/standards?tab=routines&areaId=${area.id}`} className="text-info hover:underline">
                  Active routines
                </Link>
                <span className="tabular-nums">{area.activeRoutines}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/audits?areaId=${area.id}`} className="text-info hover:underline">
                  All audits
                </Link>
              </li>
            </ul>
          </Card>
        </aside>
      </div>

      <WorkflowDialog open={editing} onOpenChange={setEditing} title={`Edit ${area.name}`} size="lg">
        <AreaForm
          initial={{
            ownerId: area.owner?.id ?? null,
            description: area.description,
            auditFrequency: area.auditFrequency,
            targetLevel: area.targetLevel,
          }}
          submitLabel="Save changes"
          busy={update.isPending}
          error={update.error ? errorMessage(update.error) : null}
          onCancel={() => setEditing(false)}
          onSubmit={(values) =>
            update.mutate(
              { id: area.id, body: values },
              {
                onSuccess: () => {
                  setEditing(false);
                  toast("Area updated", "success");
                },
              },
            )
          }
        />
      </WorkflowDialog>
    </div>
  );
}
