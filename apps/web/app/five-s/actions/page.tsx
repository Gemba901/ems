"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/patterns/ErrorState";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/patterns/PageHeader";
import { LoadingState } from "@/components/patterns/LoadingState";
import { EmptyState } from "@/components/patterns/EmptyState";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useFiveSActions } from "@/hooks/five-s/useFiveS";
import { PRACTICE_LABELS, PRACTICE_ORDER } from "@/lib/five-s/template";
import { ACTION_STATUS_LABELS, type ActionListQuery, type ActionListView, type ActionStatus, type Practice } from "@/services/five-s.service";
import {
  ActionStatusBadge,
  DueDate,
  FilterBar,
  PracticeBadge,
  errorMessage,
} from "@/components/five-s/ui";

const VIEWS: { value: ActionListView | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "mine", label: "My actions" },
  { value: "to_verify", label: "To verify" },
  { value: "overdue", label: "Overdue" },
  { value: "no_due_date", label: "Due date not set" },
];

function ActionList() {
  const params = useSearchParams();
  const [view, setView] = useState<ActionListView | "">((params.get("view") as ActionListView | null) ?? "");
  const [filters, setFilters] = useState<ActionListQuery>({
    areaId: params.get("areaId") ?? undefined,
    auditId: params.get("auditId") ?? undefined,
    status: (params.get("status") as ActionStatus | null) ?? undefined,
  });
  const { data: actions, isLoading, error, refetch } = useFiveSActions({ ...filters, view: view || undefined });

  return (
    <div className="space-y-section">
      <PageHeader
        title="Improvement actions"
        description="One action per checkpoint with problem locations, plus any raised manually. Open → Awaiting verification → Verified. Closing an action never changes an audit score."
        actions={
          <Link href={`/five-s/actions/new${filters.areaId ? `?areaId=${filters.areaId}` : ""}`} className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New action
          </Link>
        }
      />

      <div role="group" aria-label="Action views" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Button
            key={v.value}
            type="button"
            aria-pressed={view === v.value}
            variant={view === v.value ? "default" : "outline"}
            onClick={() => setView(v.value)}
          >
            {v.label}
          </Button>
        ))}
      </div>

      <FilterBar value={filters} onChange={setFilters} ownerLabel="Action owner">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Status
          <NativeSelect
            className="w-full"
            value={filters.status ?? ""}
            onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as ActionStatus | undefined })}
          >
            <option value="">Any status</option>
            {(Object.keys(ACTION_STATUS_LABELS) as ActionStatus[]).map((s) => (
              <option key={s} value={s}>
                {ACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          S
          <NativeSelect
            className="w-full"
            value={filters.practice ?? ""}
            onChange={(e) => setFilters({ ...filters, practice: (e.target.value || undefined) as Practice | undefined })}
          >
            <option value="">All five</option>
            {PRACTICE_ORDER.map((p) => (
              <option key={p} value={p}>
                {PRACTICE_LABELS[p]}
              </option>
            ))}
          </NativeSelect>
        </label>
      </FilterBar>
      {filters.auditId && (
        <p className="text-sm text-muted-foreground">
          Showing actions from one audit.{" "}
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => setFilters({ ...filters, auditId: undefined })}>
            Show all
          </Button>
        </p>
      )}

      {isLoading && <LoadingState label="Loading actions…" />}
      {!!error && <ErrorState title="Unable to load improvement actions" description={errorMessage(error)} onRetry={() => void refetch()} />}
      {!error && actions?.length === 0 && <EmptyState title="No actions match these filters" />}
      {!error && actions && actions.length > 0 && (
        <Card className="block gap-0 py-0">
          <ul className="divide-y divide-border">
            {actions.map((a) => (
              <li key={a.id}>
                <Link href={`/five-s/actions/${a.id}`} className="block px-5 py-4 hover:bg-muted focus-visible:outline-ring">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{a.reference}</span>
                    <PracticeBadge practice={a.practice} />
                    <ActionStatusBadge status={a.status} />
                    {a.source === "MANUAL" && <span className="text-xs text-muted-foreground">Manual</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-foreground">{a.finding}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{a.area.name}</span>
                    {a.audit && (
                      <span>
                        · {a.audit.reference}
                        {a.checkpointNo ? `, checkpoint ${a.checkpointNo}` : ""}
                      </span>
                    )}
                    <span>· Owner: {a.owner?.name ?? "not assigned"}</span>
                    {a.correctiveActionProgress.total > 0 && (
                      <span>
                        · {a.correctiveActionProgress.done}/{a.correctiveActionProgress.total} steps done
                      </span>
                    )}
                    <span>·</span>
                    <DueDate date={a.dueDate} overdue={a.isOverdue} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function ActionsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading actions…" />}>
      <ActionList />
    </Suspense>
  );
}
