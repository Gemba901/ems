"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChargePreparationService,
  SteelChargePreparation,
  SelectMaterialLotsPayload,
} from "@/services/steel-charge-preparation.service";
import { MaterialIntakeService } from "@/services/material-intake.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScreenHeader } from "@/components/steel/p04/ScreenHeader";
import { WorkflowIndicator } from "@/components/steel/p04/WorkflowIndicator";
import { ScreenSidebar } from "@/components/steel/p04/ScreenSidebar";
import { ContextSummary } from "@/components/steel/p04/ContextSummary";
import { ChargeProgress } from "@/components/steel/p04/ChargeProgress";
import { SCREEN_TOP_STEPS } from "@/components/steel/p04/screenMap";
import { Field, SubStep, SaveButton, SubStepStatus } from "@/components/steel/p04/shared";
import { ClipboardList, Info, ListChecks, Lightbulb, Loader2 } from "lucide-react";

function subStatus(active: boolean, done: boolean): SubStepStatus {
  if (done) return "done";
  if (active) return "active";
  return "locked";
}

// ── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <ScreenSidebar>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-600" />
            About this step
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            Confirm what production plan this charge is being prepared for, then select the released material lots
            that will make up this charge.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-purple-600" />
            What happens next
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 leading-relaxed">
            Once material lots are selected, this preparation moves on to sorting, cleaning, and staging the
            material.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc pl-4">
            <li>Only released material can be selected for a charge.</li>
            <li>A lot already used in another charge preparation won&apos;t appear here.</li>
            <li>You can select more than one lot for a single charge.</li>
          </ul>
        </CardContent>
      </Card>
    </ScreenSidebar>
  );
}

// ── P04-A02 ──

function LotSelectionForm({
  prep, token, onDone,
}: { prep: SteelChargePreparation; token: string; onDone: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: released, isLoading } = useQuery({
    queryKey: ["material-intake", "released-lots"],
    queryFn: () => MaterialIntakeService.getAll(token, { status: "RELEASED", limit: 100 }),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: (payload: SelectMaterialLotsPayload) => ChargePreparationService.selectMaterialLots(prep.id, payload, token),
    onSuccess: onDone,
    onError: (err: Error) => setError(err.message),
  });

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const lots = released?.data ?? [];

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
      ) : lots.length === 0 ? (
        <p className="text-sm text-slate-400">
          No released material is currently available to select. Material becomes available here once it has been
          released to stock in Material Intake.
        </p>
      ) : (
        <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {lots.map((lot) => (
            <label
              key={lot.id}
              className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(lot.id)}
                onChange={() => toggle(lot.id)}
              />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <span className="font-medium text-slate-800">{lot.intakeNumber}</span>
                <span className="text-slate-500">{lot.materialType?.replace(/_/g, " ") ?? "—"}</span>
                <span className="text-slate-500">{lot.grade ?? "—"}</span>
                <span className="text-slate-500">{lot.netWeightTonnes !== null ? `${lot.netWeightTonnes} t` : "—"}</span>
              </div>
            </label>
          ))}
        </div>
      )}
      <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button size="sm" disabled={selected.length === 0 || mutation.isPending} onClick={() => mutation.mutate({ intakeIds: selected, lotSelectionNotes: notes || undefined })}>
        <SaveButton pending={mutation.isPending} label={`Select ${selected.length || ""} lot${selected.length === 1 ? "" : "s"}`} />
      </Button>
    </div>
  );
}

// ── Screen shell ──────────────────────────────────────────────────────────────

export function S1RequirementSelection({
  prep, token, onRefresh,
}: { prep: SteelChargePreparation; token: string; onRefresh: () => void }) {
  const actions = prep.allowedActions ?? [];
  const lotsStatus = subStatus(actions.includes("SELECT_LOTS"), prep.materialLots.length > 0);
  const doneCount = lotsStatus === "done" ? 2 : 1;
  const activeIdx = lotsStatus === "active" ? 1 : null;

  return (
    <TooltipProvider>
      <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
        <ScreenHeader
          icon={ClipboardList}
          title="Requirement & Material Selection"
          subtitle="Confirm the production plan and select the released material for this charge."
        />
        <WorkflowIndicator steps={SCREEN_TOP_STEPS[0]} doneCount={doneCount} activeIndex={activeIdx} />
        <ContextSummary prep={prep} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
          <div className="space-y-4">
            <SubStep
              code="P04-A01"
              title="Production Plan & Material Requirement"
              status="done"
              summary={`Plan ${prep.plan?.planNumber ?? "—"}${prep.stockAvailabilityConfirmed ? " · stock confirmed" : ""}`}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Plan" value={prep.plan?.planNumber} />
                <Field label="Plan status" value={prep.plan?.status} />
                <Field label="Stock availability confirmed" value={prep.stockAvailabilityConfirmed === null ? null : prep.stockAvailabilityConfirmed ? "Yes" : "No"} />
                <Field label="Requirement notes" value={prep.requirementNotes} />
              </div>
            </SubStep>

            <SubStep
              code="P04-A02"
              title="Select Raw Material Lots"
              status={lotsStatus}
              summary={prep.materialLots.length ? `${prep.materialLots.length} lot(s) selected` : undefined}
            >
              {lotsStatus === "active" && <LotSelectionForm prep={prep} token={token} onDone={onRefresh} />}
            </SubStep>
          </div>
          <ScreenSidebar>
            <ChargeProgress prep={prep} />
            <Sidebar />
          </ScreenSidebar>
        </div>
      </div>
    </TooltipProvider>
  );
}
