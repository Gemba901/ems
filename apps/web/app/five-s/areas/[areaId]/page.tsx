"use client";

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
  EmptyState,
  ErrorNote,
  FiveSDialog,
  HEADER_ACTIONS,
  KeyValue,
  LevelValue,
  Loading,
  PracticeBadge,
  SampleBadge,
  Surface,
  TargetBadge,
  errorMessage,
  formatDate,
  formatTimestamp,
  linkButton,
  primaryButton,
  secondaryButton,
} from "@/components/five-s/ui";

export default function AreaDetailPage() {
  const { areaId } = useParams<{ areaId: string }>();
  const { data: area, isLoading, error } = useFiveSArea(areaId);
  const update = useUpdateArea();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <Loading label="Loading area…" />;
  if (error || !area) return <ErrorNote>{errorMessage(error, "Area not found")}</ErrorNote>;

  const latest = area.latest;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Link href="/five-s/areas" className={linkButton}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Workplace areas
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{area.name}</h1>
            {area.isSample && <SampleBadge />}
            {!area.isActive && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Inactive</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {area.department?.name ?? "No department"} · Owner: {area.owner?.name ?? "not set"} · {AUDIT_FREQUENCY_LABELS[area.auditFrequency]} audits
          </p>
        </div>
        <div className={HEADER_ACTIONS}>
          {area.permissions.canEdit && (
            <>
              <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
              </button>
              <button
                type="button"
                className={secondaryButton}
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: area.id, body: { isActive: !area.isActive } },
                    {
                      onSuccess: () => toast(area.isActive ? "Area deactivated" : "Area reactivated", "success"),
                      onError: (e) => toast(errorMessage(e), "error"),
                    },
                  )
                }
              >
                {area.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </>
          )}
          {area.permissions.canAudit && (
            <Link href={`/five-s/audits/new?areaId=${area.id}`} className={primaryButton}>
              Start an audit
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Surface className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Latest submitted audit</h2>
                <p className="text-xs text-slate-500">{area.method}</p>
              </div>
              {latest && (
                <Link href={`/five-s/audits/${latest.id}`} className={linkButton}>
                  {latest.reference} · {formatDate(latest.auditDate)}
                </Link>
              )}
            </div>
            {!latest ? (
              <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                <span className="font-semibold">Not assessed.</span> This area has no submitted audit yet.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Current level</p>
                    <LevelValue level={latest.level} className="text-2xl" />
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Target</p>
                    <p className="text-2xl font-semibold tabular-nums">{formatLevel(area.targetLevel)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Abnormality points</p>
                    <p className="text-2xl font-semibold tabular-nums">{latest.totalPoints}</p>
                  </div>
                  <div className="flex items-center rounded-lg bg-slate-50 p-3">
                    <TargetBadge met={area.targetMet} />
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-5 gap-2 text-center">
                  {PRACTICE_ORDER.map((p) => (
                    <div key={p} className="rounded-lg border border-slate-100 p-2">
                      <dt className="truncate text-[11px] text-slate-500">{PRACTICE_LABELS[p]}</dt>
                      <dd className="text-lg font-semibold tabular-nums">{latest.points[p]}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {area.otherMethodAuditCount > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                {area.otherMethodAuditCount} audit(s) made with a different assessment method are kept separately and not compared here.
              </p>
            )}
          </Surface>

          {area.drafts.length > 0 && (
            <Surface className="border-dashed border-amber-300 bg-amber-50/40">
              <div className="border-b border-amber-200 px-5 py-3">
                <h2 className="text-base font-semibold text-slate-900">Draft audits</h2>
                <p className="text-xs text-slate-600">Not submitted. Drafts never count towards results.</p>
              </div>
              <ul className="divide-y divide-amber-100">
                {area.drafts.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <Link href={`/five-s/audits/${d.id}`} className="font-medium text-blue-700 hover:underline">
                        {d.reference}
                      </Link>{" "}
                      <AuditStatusBadge status="DRAFT" />
                      <p className="text-xs text-slate-500">
                        {formatDate(d.auditDate)} · {d.auditor?.name ?? "—"} · {d.answered}/20 answered · saved {formatTimestamp(d.updatedAt)}
                      </p>
                    </div>
                    <Link href={`/five-s/audits/${d.id}`} className={secondaryButton}>
                      Resume
                    </Link>
                  </li>
                ))}
              </ul>
            </Surface>
          )}

          <Surface>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Outstanding actions</h2>
              <Link href={`/five-s/actions?areaId=${area.id}`} className={linkButton}>
                All actions
              </Link>
            </div>
            {area.outstandingActions.length === 0 ? (
              <EmptyState title="No outstanding actions" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {area.outstandingActions.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/five-s/actions/${a.id}`} className="font-medium text-blue-700 hover:underline">
                        {a.reference}
                      </Link>
                      <PracticeBadge practice={a.practice} />
                      <ActionStatusBadge status={a.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-700">{a.finding}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Owner: {a.owner?.name ?? "not assigned"} · <DueDate date={a.dueDate} overdue={a.status === "OPEN" && !!a.dueDate && a.dueDate < today} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface>
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Previous results</h2>
            </div>
            {area.history.length === 0 ? (
              <EmptyState title="No submitted audits yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-3 py-2">Audit</th>
                      {PRACTICE_ORDER.map((p) => (
                        <th key={p} className="px-2 py-2 text-right">
                          {PRACTICE_LABELS[p]}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2">Level</th>
                      <th className="px-3 py-2">Target then</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {area.history.map((h) => (
                      <tr key={h.id}>
                        <td className="whitespace-nowrap px-4 py-2">{formatDate(h.auditDate)}</td>
                        <td className="px-3 py-2">
                          <Link href={`/five-s/audits/${h.id}`} className="text-blue-700 hover:underline">
                            {h.reference}
                          </Link>
                        </td>
                        {PRACTICE_ORDER.map((p) => (
                          <td key={p} className="px-2 py-2 text-right tabular-nums">
                            {h.points[p]}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{h.totalPoints}</td>
                        <td className="px-3 py-2">
                          <LevelValue level={h.level} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="mr-2 tabular-nums">{h.targetLevel == null ? "—" : formatLevel(h.targetLevel)}</span>
                          <TargetBadge met={h.targetMet} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </div>

        <aside className="space-y-6">
          <Surface className="p-5">
            <dl className="space-y-3">
              <KeyValue label="Audit schedule">
                {area.isActive ? <AuditDueBadge state={area.auditDue.state} nextDueDate={area.auditDue.nextDueDate} /> : "Not scheduled (inactive)"}
              </KeyValue>
              <KeyValue label="Description">{area.description || <span className="text-slate-400">None</span>}</KeyValue>
              <KeyValue label="Audit boundary">
                <span className="whitespace-pre-line">{area.auditBoundary || <span className="text-slate-400">Not defined</span>}</span>
              </KeyValue>
            </dl>
          </Surface>
          <Surface className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">In this area</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between">
                <Link href={`/five-s/red-tags?areaId=${area.id}`} className="text-blue-700 hover:underline">
                  Pending red tags
                </Link>
                <span className="tabular-nums">{area.counts.pendingRedTags}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/actions?areaId=${area.id}&view=no_due_date`} className="text-blue-700 hover:underline">
                  Actions with due date not set
                </Link>
                <span className="tabular-nums">{area.counts.noDueDate}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/standards?areaId=${area.id}`} className="text-blue-700 hover:underline">
                  Approved standards
                </Link>
                <span className="tabular-nums">{area.approvedStandards}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/standards?tab=routines&areaId=${area.id}`} className="text-blue-700 hover:underline">
                  Active routines
                </Link>
                <span className="tabular-nums">{area.activeRoutines}</span>
              </li>
              <li className="flex justify-between">
                <Link href={`/five-s/audits?areaId=${area.id}`} className="text-blue-700 hover:underline">
                  All audits
                </Link>
              </li>
            </ul>
          </Surface>
        </aside>
      </div>

      <FiveSDialog open={editing} onOpenChange={setEditing} title={`Edit ${area.name}`} size="lg">
        <AreaForm
          initial={{
            name: area.name,
            departmentId: area.department?.id ?? null,
            ownerId: area.owner?.id ?? null,
            description: area.description,
            auditBoundary: area.auditBoundary,
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
      </FiveSDialog>
    </div>
  );
}
