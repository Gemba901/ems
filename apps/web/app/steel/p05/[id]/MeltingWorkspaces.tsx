"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MELTING_STAGE_ORDER, type SteelMelting } from "@/services/steel-melting.service";
import { ContextSummary } from "@/components/steel/p05/ContextSummary";
import { OperationalMetrics } from "@/components/steel/p05/OperationalMetrics";
import { HeatInfoStrip } from "@/components/steel/p05/HeatInfoStrip";
import { TemperatureMonitoringCard } from "@/components/steel/p05/TemperatureMonitoringCard";
import { HeatOperationsTabs } from "@/components/steel/p05/HeatOperationsTabs";
import { MeltingReviewRelease } from "@/components/steel/p05/MeltingReviewRelease";
import { SubStep, HelpPopover, Field, subStatus, SubStepStatus } from "@/components/steel/p05/shared";
import {
  OPERATIONS_HELP,
  LiningCheckForm,
  SystemsCheckForm,
  PreviousHeatForm,
  VerifyChargeForm,
  LoadChargeForm,
  StartMeltingForm,
  MonitorMeltForm,
} from "@/components/steel/p05/forms/heat-operations-forms";
import { RELEASE_ROLES, AdditionsForm, SlagForm, OutputForm, ConfirmReadyForm } from "@/components/steel/p05/forms/review-release-forms";

type SectionKey = "readiness" | "charging" | "monitor" | "output" | "review";

function workspaceDone(steps: SubStepStatus[]): boolean {
  return steps.every((s) => s === "done");
}

/**
 * P05 input screen — a fixed sidebar (Furnace readiness / Charge loading /
 * Melting monitor / Slag and output / Review & release) driving a full-swap
 * content panel. Every activity still gates strictly on melting.
 * allowedActions from the backend; this only groups the real A01-A14
 * activities into the sections an operator navigates between. No section
 * expands or collapses in place — SubStep already renders a step as a full
 * form (active), a one-line recap (done), or a locked placeholder, with no
 * manual toggle, so sections read top-to-bottom without an accordion.
 */
export function MeltingWorkspaces({ melting, onRefresh }: { melting: SteelMelting; onRefresh: () => void }) {
  const { accessToken, user } = useAuthStore();
  const token = accessToken!;
  const canHandover = !!(user?.roleLevel && RELEASE_ROLES.includes(user.roleLevel as Role));

  const actions = melting.allowedActions ?? [];
  const closed = melting.status === "CLOSED";

  const liningStatus = subStatus(actions.includes("CHECK_LINING"), !!melting.liningVisualCondition);
  const systemsStatus = subStatus(actions.includes("CHECK_UTILITIES"), melting.alarmsOk !== null);
  const previousHeatStatus = subStatus(actions.includes("CHECK_PREVIOUS_HEAT"), !!melting.slagCleaningStatus);
  const verifyStatus = subStatus(actions.includes("VERIFY_CHARGE"), melting.actualWeightVsRecipeOk !== null);
  const loadStatus = subStatus(actions.includes("LOAD_CHARGE"), !!melting.loadingTime);
  const startStatus = subStatus(actions.includes("START_MELTING"), !!melting.meltingStartTime);
  const monitorMeltStatus = subStatus(
    actions.includes("MONITOR_POWER") || actions.includes("MONITOR_TEMPERATURE"),
    melting.temperatureCelsius !== null,
  );
  // additions is a legitimate DB null when the operator explicitly chooses
  // "no additions" (recordAdditions stores Prisma.JsonNull), so "!== null"
  // alone can't tell that apart from "not reached yet" — fall back to stage
  // position past A10 so the zero-additions path still reads as done.
  const stageIdx = MELTING_STAGE_ORDER.indexOf(melting.stage);
  const additionsStatus = subStatus(
    actions.includes("RECORD_ADDITIONS"),
    melting.additions !== null || stageIdx > MELTING_STAGE_ORDER.indexOf("A10_RECORD_ADDITIONS"),
  );
  const slagStatus = subStatus(actions.includes("REMOVE_SLAG"), melting.slagNotApplicable !== null || !!melting.slagRemovalTime);
  const outputStatus = subStatus(actions.includes("RECORD_OUTPUT"), melting.outputWeightTonnes !== null);
  const readyStatus = subStatus(actions.includes("CONFIRM_READY"), melting.liquidReady !== null);

  const readinessDone = workspaceDone([liningStatus, systemsStatus, previousHeatStatus]);
  const chargingDone = workspaceDone([verifyStatus, loadStatus]);
  const monitorDone = workspaceDone([startStatus, monitorMeltStatus, additionsStatus]);
  const outputDone = workspaceDone([slagStatus, outputStatus, readyStatus]);
  const reviewReady = readinessDone && chargingDone && monitorDone && outputDone;

  // Reason supplied via the Review & Release "reopen" dialog when a section
  // being revisited already has logged activity — threaded into that
  // section's forms so their mutation calls carry it (backend requires it
  // for a re-submission of an already-logged A02-A13 activity, ignores it
  // otherwise). Cleared once that section's edit succeeds.
  const [editReasons, setEditReasons] = useState<Partial<Record<SectionKey, string>>>({});
  const handleSectionDone = (section: SectionKey) => {
    setEditReasons((prev) => ({ ...prev, [section]: undefined }));
    onRefresh();
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <ContextSummary melting={melting} />

      <HeatInfoStrip melting={melting} />

      {melting.meltingStartTime && <TemperatureMonitoringCard melting={melting} token={token} />}

      <HeatOperationsTabs melting={melting} token={token} />

      <div className="space-y-4">
          <section>
            <Card className="border-blue-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Furnace Readiness</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">Is the furnace safe and ready to receive this heat?</p>
                  </div>
                  <HelpPopover title={OPERATIONS_HELP.title} sections={OPERATIONS_HELP.sections} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-2 border-b border-slate-100">
                  <Field label="Furnace" value={melting.furnace ? `${melting.furnace.code} — ${melting.furnace.name}` : melting.furnaceId} />
                  <Field label="Planned heat" value={melting.plannedHeatRef} />
                  <Field label="Operator" value={melting.operatorName} />
                  <Field label="Shift" value={melting.shift} />
                </div>
                <SubStep
                  code="P05-A02"
                  title="Furnace Lining Check"
                  status={liningStatus}
                  summary={
                    melting.liningVisualCondition
                      ? `Condition: ${melting.liningVisualCondition}${melting.lining ? ` · ${melting.lining.heatsCompleted} heats on this lining` : ""}`
                      : undefined
                  }
                >
                  <LiningCheckForm melting={melting} token={token} onDone={() => handleSectionDone("readiness")} editReason={editReasons.readiness} />
                </SubStep>
                <SubStep
                  code="P05-A03"
                  title="Furnace Systems Check"
                  status={systemsStatus}
                  summary={
                    melting.alarmsOk !== null
                      ? `Systems ${melting.waterPressureFlowOk && melting.powerSystemOk && melting.hydraulicSystemOk && melting.alarmsOk ? "OK" : "flagged"}`
                      : undefined
                  }
                >
                  <SystemsCheckForm melting={melting} token={token} onDone={() => handleSectionDone("readiness")} editReason={editReasons.readiness} />
                </SubStep>
                <SubStep
                  code="P05-A04"
                  title="Previous Heat Readiness"
                  status={previousHeatStatus}
                  summary={melting.slagCleaningStatus ? `Cleaning: ${melting.slagCleaningStatus}` : undefined}
                >
                  <PreviousHeatForm melting={melting} token={token} onDone={() => handleSectionDone("readiness")} editReason={editReasons.readiness} />
                </SubStep>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-blue-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Charge Loading</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">Confirm the correct charge has entered the furnace.</p>
                  </div>
                  <HelpPopover title={OPERATIONS_HELP.title} sections={OPERATIONS_HELP.sections} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pb-2 border-b border-slate-100">
                  <Field label="Charge ID" value={melting.chargeNumberSnapshot} />
                  <Field label="Recipe scrap (t)" value={melting.recipeScrapWeightSnapshot} />
                  <Field label="Recipe DRI (t)" value={melting.recipeDriWeightSnapshot} />
                  <Field label="Recipe alloy (t)" value={melting.recipeAlloyWeightSnapshot} />
                </div>
                <SubStep
                  code="P05-A05"
                  title="Verify Charge ID & Recipe"
                  status={verifyStatus}
                  summary={melting.actualWeightVsRecipeOk !== null ? `Matches recipe: ${melting.actualWeightVsRecipeOk ? "Yes" : "No"}` : undefined}
                >
                  <VerifyChargeForm melting={melting} token={token} onDone={() => handleSectionDone("charging")} editReason={editReasons.charging} />
                </SubStep>
                <SubStep
                  code="P05-A06"
                  title="Load Charge into Furnace"
                  status={loadStatus}
                  summary={melting.loadingTime ? `Loaded ${new Date(melting.loadingTime).toLocaleString()}` : undefined}
                >
                  <LoadChargeForm melting={melting} token={token} onDone={() => handleSectionDone("charging")} editReason={editReasons.charging} />
                </SubStep>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-blue-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Melting Monitor</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">Start the melt and monitor it through to completion.</p>
                  </div>
                  <HelpPopover title={OPERATIONS_HELP.title} sections={OPERATIONS_HELP.sections} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {(monitorMeltStatus === "active" || melting.meltingStartTime) && <OperationalMetrics melting={melting} />}
                <SubStep
                  code="P05-A07"
                  title="Start Melting Operation"
                  status={startStatus}
                  summary={melting.meltingStartTime ? `Started ${new Date(melting.meltingStartTime).toLocaleString()}` : undefined}
                >
                  <StartMeltingForm melting={melting} token={token} onDone={() => handleSectionDone("monitor")} editReason={editReasons.monitor} />
                </SubStep>
                <SubStep
                  code="P05-A08/A09"
                  title="Monitor Melt"
                  status={monitorMeltStatus}
                  summary={
                    melting.powerKwh !== null || melting.temperatureCelsius !== null
                      ? [melting.powerKwh !== null ? `${melting.powerKwh} kWh` : null, melting.temperatureCelsius !== null ? `${melting.temperatureCelsius} °C` : null]
                          .filter(Boolean)
                          .join(" · ")
                      : undefined
                  }
                >
                  <MonitorMeltForm melting={melting} token={token} onDone={() => handleSectionDone("monitor")} editReason={editReasons.monitor} />
                </SubStep>
                <SubStep
                  code="P05-A10"
                  title="Record Extra Material Additions"
                  status={additionsStatus}
                  summary={melting.additions?.length ? `${melting.additions.length} addition(s)` : "None"}
                >
                  <AdditionsForm melting={melting} token={token} onDone={() => handleSectionDone("monitor")} editReason={editReasons.monitor} />
                </SubStep>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card className="border-blue-200 shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">Slag and Output</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">Remove slag, record melt output, and confirm the liquid steel is ready.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <SubStep code="P05-A11" title="Remove Slag or Unwanted Material" status={slagStatus} summary={`Slag removal ${melting.slagNotApplicable ? "not applicable" : "recorded"}`}>
                  <SlagForm melting={melting} token={token} onDone={() => handleSectionDone("output")} editReason={editReasons.output} />
                </SubStep>
                <SubStep
                  code="P05-A12"
                  title="Record Melting Output"
                  status={outputStatus}
                  summary={melting.outputWeightTonnes !== null ? `Output ${melting.outputWeightTonnes} t` : undefined}
                >
                  <OutputForm melting={melting} token={token} onDone={() => handleSectionDone("output")} editReason={editReasons.output} />
                </SubStep>
                <SubStep
                  code="P05-A13"
                  title="Confirm Liquid Steel Ready"
                  status={readyStatus}
                  summary={melting.liquidReady !== null ? `Ready: ${melting.liquidReady ? "Yes" : "No"}` : undefined}
                >
                  <ConfirmReadyForm melting={melting} token={token} onDone={() => handleSectionDone("output")} editReason={editReasons.output} />
                </SubStep>
              </CardContent>
            </Card>
          </section>

          <section>
            <>
              {!reviewReady && !closed && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2">
                  Some sections are still outstanding — complete Furnace readiness, Charge loading, Melting monitor,
                  and Slag and output before release.
                </div>
              )}
              <MeltingReviewRelease
                melting={melting}
                token={token}
                canHandover={canHandover}
                onEditSection={(k, reason) => {
                  if (reason) setEditReasons((prev) => ({ ...prev, [k as SectionKey]: reason }));
                }}
                onDone={onRefresh}
              />
            </>
          </section>
      </div>
    </div>
  );
}

