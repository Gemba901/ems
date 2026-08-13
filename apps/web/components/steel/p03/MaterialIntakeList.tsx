"use client";

import Link from "next/link";
import { Loader2, ChevronLeft, ChevronRight, Clock, ArrowRight, X, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QueryErrorState } from "@/components/steel/dashboard/QueryErrorState";
import {
  type PaginatedMaterialIntakes,
  type SteelIntakeStatus,
  INTAKE_STAGE_LABELS,
} from "@/services/material-intake.service";
import { SCREENS, stageToScreenIndex } from "./screenMap";

const STATUS_STYLES: Record<SteelIntakeStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

const STATUS_TOOLTIPS: Record<SteelIntakeStatus, string> = {
  DRAFT: "Intake created but not yet actively progressing.",
  IN_PROGRESS: "Actively moving through the intake workflow.",
  ON_HOLD: "Paused, pending a re-decision on acceptance.",
  REJECTED: "This material was rejected and the intake is closed.",
  RELEASED: "Released to stock — intake complete.",
  CANCELLED: "This material intake was cancelled.",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  data?: PaginatedMaterialIntakes;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
  page: number;
  onPageChange: (page: number) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
}

export function MaterialIntakeList({
  data, isLoading, isError, isFetching, onRetry, page, onPageChange, filtersActive, onClearFilters,
}: Props) {
  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Material Intakes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : isError ? (
            <QueryErrorState onRetry={onRetry} isRetrying={isFetching} message="Could not load material intakes." />
          ) : !data || data.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-slate-500">
                {filtersActive ? "No material intakes match these filters." : "No material intakes yet."}
              </p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              ) : (
                <p className="text-xs text-slate-400">Record a gate arrival against a released sourcing order to get started.</p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {data.data.map((intake) => {
                  const screenIdx = stageToScreenIndex(intake.stage);
                  const screen = SCREENS[screenIdx];
                  const screenProgressPct = Math.round(((screenIdx + 1) / SCREENS.length) * 100);
                  const activityCode = intake.stage.split("_")[0];

                  return (
                    <Link
                      key={intake.id}
                      href={`/steel/p03/${intake.id}`}
                      className="group flex flex-col gap-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:shadow-sm px-4 py-3 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900">{intake.intakeNumber}</span>
                            <Tooltip>
                              <TooltipTrigger render={(triggerProps) => <Badge {...triggerProps} className={STATUS_STYLES[intake.status]}>{intake.status.replace(/_/g, " ")}</Badge>} />
                              <TooltipContent>{STATUS_TOOLTIPS[intake.status]}</TooltipContent>
                            </Tooltip>
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            {intake.sourcingOrder?.sourcingNumber ?? "—"}
                            <span className="inline-flex items-center gap-1">
                              <Truck className="h-3 w-3 text-slate-400" /> {intake.vehicleNumber}
                            </span>
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
                              {activityCode} is this delivery&apos;s current step — {INTAKE_STAGE_LABELS[intake.stage]}.
                              {" "}{screen.code} groups it with related steps on this screen.
                            </TooltipContent>
                          </Tooltip>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatDate(intake.updatedAt) ?? "—"}
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
                    Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} intakes
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
    </TooltipProvider>
  );
}
