"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useFiveSRedTags } from "@/hooks/five-s/useFiveS";
import { RED_TAG_REASON_LABELS, RED_TAG_STATUS_LABELS, type RedTagListQuery, type RedTagStatus } from "@/services/five-s.service";
import {
  EmptyState,
  ErrorNote,
  FilterBar,
  Loading,
  PageHeader,
  RedTagStatusBadge,
  Surface,
  errorMessage,
  formatDate,
  primaryButton,
  selectClass,
} from "@/components/five-s/ui";

type ViewValue = "" | "pending" | "review_overdue" | RedTagStatus;

function RedTagList() {
  const params = useSearchParams();
  const initialView = (params.get("view") ?? params.get("status") ?? "") as ViewValue;
  const [filters, setFilters] = useState<RedTagListQuery>({ areaId: params.get("areaId") ?? undefined });
  const [view, setView] = useState<ViewValue>(initialView);
  const query: RedTagListQuery = {
    ...filters,
    ...(view === "pending" || view === "review_overdue" ? { view } : view ? { status: view } : {}),
  };
  const { data: tags, isLoading, error } = useFiveSRedTags(query);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Red-tag register"
        description="Items whose need is in doubt. A tag stays pending until both the decision and the disposition are recorded. Asset records are never deleted here."
        actions={
          <Link href={`/five-s/red-tags/new${filters.areaId ? `?areaId=${filters.areaId}` : ""}`} className={primaryButton}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Raise a red tag
          </Link>
        }
      />

      <FilterBar value={filters} onChange={setFilters} ownerLabel="Tag owner">
        <label className="space-y-1 text-xs font-medium text-slate-600">
          Show
          <select className={selectClass} value={view} onChange={(e) => setView(e.target.value as ViewValue)}>
            <option value="">All tags</option>
            <option value="pending">Pending (not yet resolved)</option>
            <option value="review_overdue">Review overdue</option>
            {(Object.keys(RED_TAG_STATUS_LABELS) as RedTagStatus[]).map((s) => (
              <option key={s} value={s}>
                {RED_TAG_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      {isLoading && <Loading label="Loading red tags…" />}
      {!!error && <ErrorNote>{errorMessage(error)}</ErrorNote>}
      {tags && tags.length === 0 && (
        <Surface>
          <EmptyState title="No red tags match these filters" />
        </Surface>
      )}
      {tags && tags.length > 0 && (
        <Surface>
          <ul className="divide-y divide-slate-100">
            {tags.map((t) => (
              <li key={t.id}>
                <Link href={`/five-s/red-tags/${t.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-red-700">{t.reference}</span>
                      <span className="font-medium text-slate-900">{t.itemName}</span>
                      {t.quantity && <span className="text-xs text-slate-500">({t.quantity})</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.area.name} · {t.location} · {RED_TAG_REASON_LABELS[t.reason]} · Raised {formatDate(t.raisedOn)} · Owner: {t.owner?.name ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {t.decisionLabel && <span className="text-xs font-medium text-slate-700">{t.decisionLabel}</span>}
                    <RedTagStatusBadge status={t.status} />
                    {t.reviewOverdue && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Review overdue</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}

// useSearchParams needs a Suspense boundary (Next 16 build requirement).
export default function RedTagsPage() {
  return (
    <Suspense fallback={<Loading label="Loading red tags…" />}>
      <RedTagList />
    </Suspense>
  );
}
