"use client";

import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight, Calendar, User, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type PaginatedSteelPlans,
} from "@/services/steel.service";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import { statusBadgeClass } from "@/lib/steelStatusColors";
import { SCREENS, stageToScreenIndex } from "./screenMap";

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  data?: PaginatedSteelPlans;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  page: number;
  onPageChange: (page: number) => void;
}

export function ProductionPlanList({ data, isLoading, isError, isFetching, onRetry, page, onPageChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Plans</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : isError ? (
          <QueryErrorState onRetry={onRetry} isRetrying={isFetching} message="Could not load production plans." />
        ) : !data || data.data.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No production plans match these filters.</p>
        ) : (
          <>
            <div className="space-y-2.5">
              {data.data.map((plan) => {
                const targetDate = formatDate(plan.plannedStartDate) ?? formatDate(plan.expectedDeliveryDate);
                const quantity = plan.totalQuantity ?? plan.requestedQuantityTonnes;
                const screenIdx = stageToScreenIndex(plan.stage);
                const screen = SCREENS[screenIdx];
                const screenProgressPct = Math.round(((screenIdx + 1) / SCREENS.length) * 100);

                return (
                  <Link
                    key={plan.id}
                    href={`/steel/p01/${plan.id}`}
                    className="group flex flex-col gap-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:shadow-sm px-4 py-3 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{plan.planNumber}</span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wide">Status</span>
                          <Badge className={statusBadgeClass(plan.status)}>{plan.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="text-xs text-slate-500">
                          {plan.customerName || plan.dealerName || plan.projectReference || "—"}
                          {plan.productType && <span> · {plan.productType.replace(/_/g, " ")}</span>}
                          {plan.grade && <span> · Grade {plan.grade}</span>}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
                        <span className="font-medium text-slate-700">{quantity} t</span>
                        {targetDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {targetDate}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {plan.createdBy.firstName} {plan.createdBy.lastName}
                        </span>
                        <span className="flex items-center gap-1 text-slate-500 font-medium group-hover:text-slate-900 transition-colors">
                          View <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wide shrink-0">
                        {screen.code}/{SCREENS.length}
                      </span>
                      <div className="h-1.5 flex-1 max-w-[160px] rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500"
                          style={{ width: `${screenProgressPct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-600 font-medium">{screen.label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {data.pagination.pages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">
                  Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} plans
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= data.pagination.pages}
                    onClick={() => onPageChange(page + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
