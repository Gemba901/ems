"use client";

import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight, Clock, ArrowRight, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import {
  type PaginatedHeatApprovals,
  type SteelHeatApprovalStatus,
  HEAT_APPROVAL_STAGE_LABELS,
} from "@/services/steel-heat-approval.service";
import { SCREENS, stageToScreenIndex } from "./screenMap";

const STATUS_STYLES: Record<SteelHeatApprovalStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  CLOSED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const STATUS_TOOLTIPS: Record<SteelHeatApprovalStatus, string> = {
  DRAFT: "Heat approval record created but not yet actively progressing.",
  IN_PROGRESS: "Actively moving through the heat approval workflow.",
  ON_HOLD: "Paused and not currently progressing.",
  CLOSED: "Released to casting — heat approval finished.",
  CANCELLED: "This heat approval record was cancelled.",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  data?: PaginatedHeatApprovals;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  page: number;
  onPageChange: (page: number) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
}

export function HeatApprovalList({
  data, isLoading, isError, isFetching, onRetry, page, onPageChange, filtersActive, onClearFilters,
}: Props) {
  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Heat Approval Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <QueryErrorState onRetry={onRetry} isRetrying={isFetching} message="Could not load heat approval records." />
          ) : !data || data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-slate-500">
                {filtersActive ? "No heat approval records match these filters." : "No heat approval records found."}
              </p>
              {filtersActive ? (
                <button type="button" onClick={onClearFilters} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              ) : (
                <p className="text-xs text-slate-400">Start a new heat approval record against a heat handed over to refining to get started.</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {data.data.map((heatApproval) => {
                  const screenIdx = stageToScreenIndex(heatApproval.stage);
                  const screen = SCREENS[screenIdx];
                  const screenProgressPct = Math.round(((screenIdx + 1) / SCREENS.length) * 100);
                  const activityCode = heatApproval.stage.split("_")[0];

                  return (
                    <Link
                      key={heatApproval.id}
                      href={`/steel/p06/${heatApproval.id}`}
                      className="group flex flex-col gap-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:shadow-sm px-4 py-3 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900">{heatApproval.approvalNumber}</span>
                            <Tooltip>
                              <TooltipTrigger render={(triggerProps) => <Badge {...triggerProps} className={STATUS_STYLES[heatApproval.status]}>{heatApproval.status.replace(/_/g, " ")}</Badge>} />
                              <TooltipContent>{STATUS_TOOLTIPS[heatApproval.status]}</TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-xs text-slate-500">
                            Heat {heatApproval.melting?.heatInProcessNumber ?? "—"}
                          </p>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-slate-500 shrink-0">
                          <Tooltip>
                            <TooltipTrigger
                              render={(triggerProps) => (
                                <span {...triggerProps} className="flex items-center gap-1 font-medium text-slate-700">
                                  {activityCode}
                                </span>
                              )}
                            />
                            <TooltipContent>
                              {activityCode} — {HEAT_APPROVAL_STAGE_LABELS[heatApproval.stage]}. This is the current step; {screen.code} is the screen it belongs to.
                            </TooltipContent>
                          </Tooltip>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatDate(heatApproval.updatedAt) ?? "—"}
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
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${screenProgressPct}%` }} />
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
                    Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} records
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= data.pagination.pages} onClick={() => onPageChange(page + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
