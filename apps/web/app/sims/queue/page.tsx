"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/patterns/PageHeader";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, Suggestion, SuggestionCategory, SuggestionStatus, calcWeight } from "@/services/sims.service";
import { useQuery } from "@tanstack/react-query";

const CATEGORY_BADGE: Record<SuggestionCategory, string> = {
  QUALITY:    "bg-info-subtle text-info",
  COST:       "bg-success-subtle text-success",
  DELIVERY:   "bg-accent text-primary",
  SAFETY:     "bg-danger-subtle text-danger",
  MORALE:     "bg-warning-subtle text-warning",
  TECHNOLOGY: "bg-accent text-primary",
  UNKNOWN:    "bg-muted text-muted-foreground",
};

function QueueCard({ s, router, now }: { s: Suggestion; router: ReturnType<typeof useRouter>; now: number }) {
  const daysSince = Math.floor((now - new Date(s.createdAt).getTime()) / 86400000);
  return (
    <div
      onClick={() => router.push(`/sims/${s.id}`)}
      className="px-4 py-4 sm:px-6 sm:py-5 hover:bg-muted/70 cursor-pointer transition-colors group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {s.categories.map((c) => {
              const badge = CATEGORY_BADGE[c as SuggestionCategory];
              return badge ? (
                <span key={c} className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${badge}`}>
                  {c.charAt(0) + c.slice(1).toLowerCase()}
                </span>
              ) : null;
            })}
            {calcWeight(s.categories) > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary text-muted-foreground">
                W {calcWeight(s.categories).toFixed(1)}
              </span>
            )}
            {s.isAnonymous && (
              <span className="text-[10px] text-muted-foreground italic">Anonymous</span>
            )}
          </div>

          {/* Title + description */}
          <p className="text-sm font-semibold text-foreground leading-snug">{s.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{s.description}</p>

          {/* Submitter */}
          {s.employee && (
            <div className="flex items-center gap-2 mt-2.5 text-[11px] text-muted-foreground flex-wrap">
              <span className="font-medium text-muted-foreground">{s.employee.firstName} {s.employee.lastName}</span>
              {s.employee.department?.name && (
                <><span className="text-muted-foreground">·</span><span>{s.employee.department.name}</span></>
              )}
            </div>
          )}
        </div>

        {/* Right meta + action */}
        <div className="flex flex-col items-end gap-2 shrink-0 text-right">
          <Link href={`/sims/${s.id}`} onClick={(event) => event.stopPropagation()} className={buttonVariants({ size: "sm" })}>Review</Link>
          <p className="text-[11px] text-muted-foreground">{daysSince === 0 ? "Today" : `${daysSince}d ago`}</p>
          <span className="text-[11px] text-muted-foreground">
            {s.reviews.length} review{s.reviews.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

const ACTIVE_STATUSES: SuggestionStatus[] = ["UNDER_REVIEW", "ON_HOLD", "SELECTED_FOR_SGA"];

export default function QueuePage() {
  const router = useRouter();
  const [now] = useState(Date.now);
  const { accessToken, user } = useAuthStore();

  const { data: suggestions = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ["sims-queue", user?.roleLevel],
    queryFn: async () => {
      const data = await SimsService.getQueue(accessToken!, { limit: 500 }).then((r) => r.data);
      return data.filter((s) => ACTIVE_STATUSES.includes(s.status));
    },
    enabled: !!accessToken && !!user?.roleLevel,
  });

  const underReview = suggestions.filter((s) => s.status === "UNDER_REVIEW");
  const onHold = suggestions.filter((s) => s.status === "ON_HOLD");
  const selectedForSGA = suggestions.filter((s) => s.status === "SELECTED_FOR_SGA");

  return (
    <ProtectedRoute allowedRoles={[Role.HOD]}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <PageHeader title="Department Review Queue" />
            <p className="text-sm text-muted-foreground mt-1">
              {loading
                ? "Loading..."
                : `${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""} awaiting your review`}
            </p>
          </div>
        </div>

        {loading && <LoadingState label="Loading your review queue…" />}
        {error && <ErrorState description={error.message} onRetry={() => void refetch()} />}

        {/* All caught up */}
        {!loading && !error && suggestions.length === 0 && (
          <EmptyState title="Queue is clear" description="No suggestions are currently waiting for your review." />
        )}

        {/* Under Review section */}
        {!loading && underReview.length > 0 && (
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ready for Review</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{underReview.length}</span>
            </div>
            <div className="divide-y divide-border">
              {underReview.map((s) => (
                <QueueCard key={s.id} s={s} router={router} now={now} />
              ))}
            </div>
          </div>
        )}

        {/* On Hold section */}
        {!loading && onHold.length > 0 && (
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">On Hold</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{onHold.length}</span>
            </div>
            <div className="divide-y divide-border">
              {onHold.map((s) => (
                <QueueCard key={s.id} s={s} router={router} now={now} />
              ))}
            </div>
          </div>
        )}

        {/* Selected for SGA section */}
        {!loading && selectedForSGA.length > 0 && (
          <div className="bg-background border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-border">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Selected for SGA</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{selectedForSGA.length}</span>
            </div>
            <div className="divide-y divide-border">
              {selectedForSGA.map((s) => (
                <QueueCard key={s.id} s={s} router={router} now={now} />
              ))}
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}
