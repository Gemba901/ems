"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import {
  MaterialIntakeService,
  SteelIntakeStage,
  SteelIntakeStatus,
  INTAKE_STAGE_LABELS,
  INTAKE_STAGE_ORDER,
} from "@/services/material-intake.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, PackageSearch, Loader2, AlertTriangle } from "lucide-react";

const STATUS_STYLES: Record<SteelIntakeStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  RELEASED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export default function MaterialIntakesPage() {
  const { accessToken } = useAuthStore();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<SteelIntakeStage | "">("");
  const [status, setStatus] = useState<SteelIntakeStatus | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["material-intakes", search, stage, status, page],
    queryFn: () =>
      MaterialIntakeService.getAll(accessToken!, {
        search: search || undefined,
        stage: stage || undefined,
        status: status || undefined,
        page,
        limit: 10,
      }),
    enabled: !!accessToken,
  });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <PackageSearch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Material Intake & Receiving</h1>
            <p className="text-sm text-slate-500">P03 — Gate Arrival, Inspection, Weighing & Yard Storage</p>
          </div>
        </div>
        <Link href="/steel/p03/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Material Intake
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search intake or vehicle number..."
            className="pl-8"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={stage}
          onChange={(e) => { setStage(e.target.value as SteelIntakeStage | ""); setPage(1); }}
        >
          <option value="">All stages</option>
          {INTAKE_STAGE_ORDER.map((s) => <option key={s} value={s}>{INTAKE_STAGE_LABELS[s]}</option>)}
        </select>
        <select
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value as SteelIntakeStatus | ""); setPage(1); }}
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_STYLES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Material Intakes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <p className="text-sm text-slate-600">{error instanceof Error ? error.message : "Couldn't load material intakes."}</p>
              <button onClick={() => refetch()} className="text-sm font-medium text-slate-700 hover:text-slate-900 underline">
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {data?.data.map((intake) => (
                <div key={intake.id} className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
                  <div>
                    <Link href={`/steel/p03/${intake.id}`} className="font-medium text-slate-900 hover:underline">
                      {intake.intakeNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{intake.sourcingOrder?.sourcingNumber ?? "—"} · {intake.vehicleNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{INTAKE_STAGE_LABELS[intake.stage]}</span>
                    <Badge className={STATUS_STYLES[intake.status]}>{intake.status}</Badge>
                  </div>
                </div>
              ))}
              {data?.data.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-8">No material intakes yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
