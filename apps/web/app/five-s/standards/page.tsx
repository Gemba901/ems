"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useFiveSRoutines, useFiveSStandards } from "@/hooks/five-s/useFiveS";
import { ROUTINE_CATEGORY_LABELS, ROUTINE_FREQUENCY_LABELS, type AreaStatusFilter } from "@/services/five-s.service";
import {
  AreaSelect,
  OccurrenceBadge,
  PersonSelect,
  StandardStatusBadge,
  errorMessage,
  formatDate,
} from "@/components/five-s/ui";
import { cn } from "@/lib/utils";

type Tab = "standards" | "routines";

function StandardsAndRoutines() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get("tab") === "routines" ? "routines" : "standards";
  const [areaId, setAreaId] = useState<string | undefined>(params.get("areaId") ?? undefined);

  function switchTab(next: Tab) {
    const q = new URLSearchParams(params.toString());
    if (next === "standards") q.delete("tab");
    else q.set("tab", next);
    router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-section">
      <PageHeader
        title="Standards & routines"
        description="Standards record the agreed arrangement for an area. Routines are the regular checks that keep it. Neither changes audit scores or actions."
        actions={
          <Link
            href={tab === "standards" ? `/five-s/standards/new${areaId ? `?areaId=${areaId}` : ""}` : `/five-s/standards/routines/new${areaId ? `?areaId=${areaId}` : ""}`}
            className={buttonVariants()}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> {tab === "standards" ? "New standard" : "New routine"}
          </Link>
        }
      />

      <div role="group" aria-label="Standards and routines" className="flex gap-1 border-b border-border pb-2">
        {(["standards", "routines"] as Tab[]).map((t) => (
          <Button
            key={t}
            type="button"
            variant={tab === t ? "secondary" : "ghost"}
            aria-pressed={tab === t}
            onClick={() => switchTab(t)}
          >
            {t === "standards" ? "Standards" : "Routines"}
          </Button>
        ))}
      </div>

      {tab === "standards" ? <StandardsTab areaId={areaId} setAreaId={setAreaId} /> : <RoutinesTab areaId={areaId} setAreaId={setAreaId} />}
    </div>
  );
}

function StandardsTab({ areaId, setAreaId }: { areaId?: string; setAreaId: (id?: string) => void }) {
  const [view, setView] = useState<"" | "current" | "all">("");
  const { data, isLoading, error } = useFiveSStandards({ areaId, view: view || undefined });

  return (
    <>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Area
          <AreaSelect id="std-area" value={areaId} onChange={(v) => setAreaId(v ?? undefined)} emptyLabel="All areas" activeOnly={false} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Show
          <NativeSelect className="w-full" value={view} onChange={(e) => setView(e.target.value as "" | "current" | "all")}>
            <option value="">Current approved and drafts</option>
            <option value="current">Current approved only</option>
            <option value="all">All revisions, including superseded</option>
          </NativeSelect>
        </label>
      </div>

      {isLoading && <LoadingState label="Loading standards…" />}
      {!!error && <ErrorState description={errorMessage(error)} />}
      {data && data.length === 0 && (
        <Card className="block py-0">
          <EmptyState title="No standards yet" description="Record the agreed arrangement for an area: where things go, how they are labelled, cleaning and inspection points." />
        </Card>
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((s) => (
            <li key={s.id}>
              <Link
                href={`/five-s/standards/${s.id}`}
                className={cn(
                  "block h-full rounded-xl p-4 shadow-sm transition-colors hover:border-info",
                  s.status === "APPROVED"
                    ? "border-2 border-success bg-card"
                    : s.status === "DRAFT"
                      ? "border-2 border-dashed border-warning bg-warning-subtle/40"
                      : "border border-border bg-muted opacity-80",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StandardStatusBadge status={s.status} />
                  <span className="text-xs text-muted-foreground">Revision {s.revision}</span>
                </div>
                <p className="mt-2 font-semibold text-foreground">{s.title}</p>
                <p className="text-xs text-muted-foreground">
                  {s.area.name} · Owner: {s.owner?.name ?? "—"}
                  {s.approvedAt ? ` · Approved ${formatDate(s.approvedAt.slice(0, 10))} by ${s.approvedBy?.name ?? "—"}` : ""}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{s.instructions}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RoutinesTab({ areaId, setAreaId }: { areaId?: string; setAreaId: (id?: string) => void }) {
  const [responsibleId, setResponsibleId] = useState<string | undefined>();
  const [status, setStatus] = useState<AreaStatusFilter>("active");
  const { data, isLoading, error } = useFiveSRoutines({ areaId, responsibleId, status });

  return (
    <>
      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Area
          <AreaSelect id="routine-area" value={areaId} onChange={(v) => setAreaId(v ?? undefined)} emptyLabel="All areas" activeOnly={false} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Responsible
          <PersonSelect id="routine-person" value={responsibleId} onChange={(v) => setResponsibleId(v ?? undefined)} emptyLabel="Anyone" />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Status
          <NativeSelect className="w-full" value={status} onChange={(e) => setStatus(e.target.value as AreaStatusFilter)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </NativeSelect>
        </label>
      </div>

      {isLoading && <LoadingState label="Loading routines…" />}
      {!!error && <ErrorState description={errorMessage(error)} />}
      {data && data.length === 0 && (
        <Card className="block py-0">
          <EmptyState title="No routines" description="Set up the daily, weekly or monthly checks that keep an area to its standard." />
        </Card>
      )}
      {data && data.length > 0 && (
        <Card className="block py-0">
          <ul className="divide-y divide-border">
            {data.map((r) => (
              <li key={r.id}>
                <Link href={`/five-s/standards/routines/${r.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {r.title}
                      {!r.isActive && <span className="ml-2 rounded bg-muted px-1.5 text-xs font-normal text-muted-foreground">Inactive</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROUTINE_FREQUENCY_LABELS[r.frequency]} · {ROUTINE_CATEGORY_LABELS[r.category]} · {r.area.name} · {r.checkLocation} · {r.responsible?.name ?? "No one responsible"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                    {r.latestOccurrence && (
                      <>
                        <span className="text-muted-foreground">{formatDate(r.latestOccurrence.date)}</span>
                        <OccurrenceBadge state={r.latestOccurrence.state} />
                      </>
                    )}
                    {r.missedLast40Days > 0 && <span className="font-semibold text-danger">{r.missedLast40Days} missed in 40 days</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function StandardsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StandardsAndRoutines />
    </Suspense>
  );
}
