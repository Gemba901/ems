"use client";

import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/patterns/EmptyState";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useFiveSRedTags } from "@/hooks/five-s/useFiveS";
import { RED_TAG_REASON_LABELS, RED_TAG_STATUS_LABELS, type RedTagListQuery, type RedTagStatus } from "@/services/five-s.service";
import {
  FilterBar,
  RedTagStatusBadge,
  errorMessage,
  formatDate,
} from "@/components/five-s/ui";

type ViewValue = "" | "pending" | "review_overdue" | RedTagStatus;

function RedTagList() {
  const params = useSearchParams();
  const initialView = (params.get("view") ?? params.get("status") ?? "") as ViewValue;
  const [filters, setFilters] = useState<RedTagListQuery>({
    areaId: params.get("areaId") ?? undefined,
    ...(initialView === "pending" || initialView === "review_overdue"
      ? { view: initialView }
      : { status: initialView || undefined }),
  });
  const { data: tags, isLoading, error, refetch } = useFiveSRedTags(filters);

  return (
    <div className="space-y-section">
      <PageHeader
        title="Red-tag register"
        description="Items whose need is in doubt. A tag stays pending until both the decision and the disposition are recorded. Asset records are never deleted here."
        actions={
          <Link href={`/five-s/red-tags/new${filters.areaId ? `?areaId=${filters.areaId}` : ""}`} className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Raise a red tag
          </Link>
        }
      />

      <FilterBar value={filters} onChange={setFilters} ownerLabel="Tag owner">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Show
          <NativeSelect
            className="w-full" value={filters.view ?? filters.status ?? ""}
            onChange={(e) => {
              const selection = e.target.value as ViewValue;
              if (selection === "pending" || selection === "review_overdue") {
                setFilters({ ...filters, view: selection, status: undefined });
              } else {
                setFilters({ ...filters, view: undefined, status: selection || undefined });
              }
            }}
          >
            <option value="">All tags</option>
            <option value="pending">Pending (not yet resolved)</option>
            <option value="review_overdue">Review overdue</option>
            {(Object.keys(RED_TAG_STATUS_LABELS) as RedTagStatus[]).map((s) => (
              <option key={s} value={s}>
                {RED_TAG_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </label>
      </FilterBar>

      {isLoading && <LoadingState label="Loading red tags…" />}
      {!!error && <ErrorState title="Unable to load red tags" description={errorMessage(error)} onRetry={() => void refetch()} />}
      {!error && tags?.length === 0 && <EmptyState title="No red tags match these filters" />}
      {!error && tags && tags.length > 0 && (
        <Card className="block py-0">
          <ul className="divide-y divide-border">
            {tags.map((t) => (
              <li key={t.id}>
                <Link href={`/five-s/red-tags/${t.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-danger">{t.reference}</span>
                      <span className="font-medium text-foreground">{t.itemName}</span>
                      {t.quantity && <span className="text-xs text-muted-foreground">({t.quantity})</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.area.name} · {t.location} · {RED_TAG_REASON_LABELS[t.reason]} · Raised {formatDate(t.raisedOn)} · Owner: {t.owner?.name ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {t.decisionLabel && <span className="text-xs font-medium text-foreground">{t.decisionLabel}</span>}
                    <RedTagStatusBadge status={t.status} />
                    {t.reviewOverdue && <Badge variant="danger">Review overdue</Badge>}
                  </div>
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
export default function RedTagsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading red tags…" />}>
      <RedTagList />
    </Suspense>
  );
}
