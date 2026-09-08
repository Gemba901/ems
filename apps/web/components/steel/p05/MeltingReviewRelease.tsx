"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, SimpleTabs } from "@/components/steel/p05/shared";
import { HeatSummaryPanel, ReadinessPanel, HandoverPanel, MaterialChargeLog } from "@/components/steel/p05/forms/review-release-forms";
import { TemperatureMonitoringCard } from "@/components/steel/p05/TemperatureMonitoringCard";
import { HeatCycleDocument } from "@/components/steel/p05/HeatCycleDocument";
import type { SteelMelting } from "@/services/steel-melting.service";
import { AlertTriangle, Pencil, ClipboardList, FlaskConical, Thermometer, TestTube2, FileText, Info } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type ReviewTab = "summary" | "chemistry" | "temperature" | "samples" | "documents";

const REVIEW_TABS: { key: ReviewTab; label: string }[] = [
  { key: "summary", label: "Heat Cycle Summary" },
  { key: "chemistry", label: "Chemistry" },
  { key: "temperature", label: "Temperature" },
  { key: "samples", label: "Samples & Tests" },
  { key: "documents", label: "Documents" },
];

/**
 * Final sidebar state — summary + release, not another input form. "Edit"
 * jumps back to the relevant input section rather than letting this screen
 * silently overwrite already-logged data: the backend only exposes editing
 * a stage's fields while that stage is still the active one (allowedActions),
 * so re-opening an already-completed section here shows the recorded values
 * read-only rather than a live form — there is no field-level "override"
 * endpoint, only UpdateMeltingStatusDto's STATUS_OVERRIDE for the record's
 * overall status (ON_HOLD/CANCELLED), which doesn't apply to individual
 * A01-A13 fields.
 */
export function MeltingReviewRelease({
  melting,
  token,
  canHandover,
  onEditSection,
  onDone,
}: {
  melting: SteelMelting;
  token: string;
  canHandover: boolean;
  /** `reason` is set only when re-opening a section that already has a logged activity — the caller must pass it through to that section's mutation. */
  onEditSection: (sectionKey: string, reason?: string) => void;
  onDone: () => void;
}) {
  const [confirmEdit, setConfirmEdit] = useState<{ sectionKey: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<ReviewTab>("summary");

  const weightMismatch = melting.actualWeightVsRecipeOk === false;
  const recipeTotal =
    (melting.recipeScrapWeightSnapshot ?? 0) + (melting.recipeDriWeightSnapshot ?? 0) + (melting.recipeAlloyWeightSnapshot ?? 0);

  const requestEdit = (sectionKey: string, label: string, alreadyLogged: boolean) => {
    if (alreadyLogged) {
      setReason("");
      setConfirmEdit({ sectionKey, label });
    } else {
      onEditSection(sectionKey);
    }
  };

  const readinessItems: { code: string; label: string; status: "done" | "active" }[] = [
    { code: "A11", label: "Slag Removed", status: melting.slagNotApplicable !== null || !!melting.slagRemovalTime ? "done" : "active" },
    { code: "A12", label: "Output Recorded", status: melting.outputWeightTonnes !== null ? "done" : "active" },
    { code: "A13", label: "Liquid Steel Ready", status: melting.liquidReady !== null ? "done" : "active" },
    { code: "A14", label: "Handed Over to Refining", status: melting.status === "CLOSED" ? "done" : "active" },
  ];

  return (
    <div className="space-y-4">
      <SimpleTabs tabs={REVIEW_TABS} active={tab} onSelect={setTab} />

      {tab === "summary" && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-slate-500" />
            Melt Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Field label="Melt time" value={melting.outputMeltTimeMinutes !== null ? `${melting.outputMeltTimeMinutes} min` : "Not recorded"} />
          <Field label="Energy total" value={melting.outputEnergyTotalKwh !== null ? `${melting.outputEnergyTotalKwh} kWh` : "Not recorded"} />
          <Field label="Output weight" value={melting.outputWeightTonnes !== null ? `${melting.outputWeightTonnes} t` : "Not recorded"} />
          <Field label="Liquid temperature" value={melting.liquidTemperatureCelsius !== null ? `${melting.liquidTemperatureCelsius} °C` : "Not recorded"} />
        </CardContent>
      </Card>

      {weightMismatch && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Recipe vs. Actual Mismatch
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Field label="Recipe scrap (t)" value={melting.recipeScrapWeightSnapshot} />
            <Field label="Recipe DRI (t)" value={melting.recipeDriWeightSnapshot} />
            <Field label="Recipe alloy (t)" value={melting.recipeAlloyWeightSnapshot} />
            <Field label="Recipe total (t)" value={recipeTotal || "—"} />
            <p className="col-span-2 sm:col-span-4 text-xs text-amber-700">
              Operator flagged the actual charge as not matching the recipe at verification (P05-A05). Review the
              material charges under Charge loading before releasing.
            </p>
            <div className="col-span-2 sm:col-span-4">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => requestEdit("charging", "Charge loading", true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit charge loading
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ReadinessPanel items={readinessItems} />
      <HeatSummaryPanel melting={melting} token={token} />
      <MaterialChargeLog melting={melting} token={token} />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => requestEdit("readiness", "Furnace readiness", true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit furnace readiness
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => requestEdit("charging", "Charge loading", true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit charge loading
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => requestEdit("monitor", "Melting monitor", true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit melting monitor
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => requestEdit("output", "Slag and output", melting.outputWeightTonnes !== null)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit slag and output
        </Button>
      </div>

      {confirmEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Reopen &ldquo;{confirmEdit.label}&rdquo;?</h2>
            <p className="text-sm text-slate-500">
              This section already has recorded data. Note why it needs to be revisited before continuing — this is
              recorded for the audit trail, since individual fields can&apos;t be silently overwritten once logged.
            </p>
            <textarea
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm min-h-20"
              placeholder="Reason for reopening this section (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmEdit(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!reason.trim()}
                onClick={() => {
                  onEditSection(confirmEdit.sectionKey, reason.trim());
                  setConfirmEdit(null);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Release to Refining</CardTitle>
        </CardHeader>
        <CardContent>
          <HandoverPanel melting={melting} token={token} canAct={canHandover} onDone={onDone} />
        </CardContent>
      </Card>
      </>
      )}

      {tab === "chemistry" && <ChemistryTab />}
      {tab === "temperature" && <TemperatureTab melting={melting} token={token} />}
      {tab === "samples" && <SamplesTab />}
      {tab === "documents" && <DocumentsTab melting={melting} token={token} />}
    </div>
  );
}

// Chemistry composition (element %, target ranges, deviation) is captured
// entirely in P06 Heat Approval (SteelHeatApproval.chemistryComposition /
// chemistryMatchesGrade in steel-heat-approval.service.ts) — melting itself
// never records element-level chemistry. Rather than fabricate rows or drop
// the tab, this shows an honest "not tracked here" state that points to
// where the real data lives.
function ChemistryTab() {
  return (
    <Card>
      <CardContent className="py-8 flex flex-col items-center text-center gap-2">
        <FlaskConical className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Chemistry composition is not tracked in Melting.</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Element-by-element chemistry (actual %, target range, deviation) is captured in P06 Heat Approval once the
          heat is handed over to refining/quality — it does not exist as melting data.
        </p>
      </CardContent>
    </Card>
  );
}

// Real temperature data captured during melting: melting.liquidTemperatureCelsius
// (the P05-A13 confirmed liquid temperature) plus the same reading trend
// chart used on the Heat Operations screen (TemperatureMonitoringCard,
// reused as-is — same component, same "heat-cycle-events" query).
function TemperatureTab({ melting, token }: { melting: SteelMelting; token: string }) {
  return (
    <div className="space-y-4">
      <TemperatureMonitoringCard melting={melting} token={token} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Thermometer className="h-4 w-4 text-slate-500" />
            Tap Temperature
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Field
            label="Liquid Temperature (confirmed at P05-A13)"
            value={melting.liquidTemperatureCelsius !== null ? `${melting.liquidTemperatureCelsius} °C` : "Not recorded"}
          />
          <Field
            label="Liquid Steel Ready"
            value={melting.liquidReady === null ? "Not confirmed" : melting.liquidReady ? "Yes" : "No"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Sample/test tracking (sampleRef, sampleTakenAt, analysis results) also
// lives entirely in P06 Heat Approval — melting has no sample fields at
// all. Honest "not available" state, same reasoning as ChemistryTab.
function SamplesTab() {
  return (
    <Card>
      <CardContent className="py-8 flex flex-col items-center text-center gap-2">
        <TestTube2 className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Samples & tests are not tracked in Melting.</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Sample reference, sample time, and analysis results are recorded in P06 Heat Approval, not in this melting
          record.
        </p>
      </CardContent>
    </Card>
  );
}

// The only real generated document in melting's domain is the Heat Cycle
// Report workbook (HeatCycleDocument, existing, unchanged) — available once
// the record is closed. The mockup's Chemistry Report / Temperature Log /
// Samples Report are P06/other-module artifacts that don't exist here, so
// they're not listed rather than invented as fake attachment rows.
function DocumentsTab({ melting, token }: { melting: SteelMelting; token: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-slate-500" />
          Attached Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {melting.status === "CLOSED" ? (
          <HeatCycleDocument melting={melting} token={token} />
        ) : (
          <p className="text-sm text-slate-400">The Heat Cycle Report becomes available once this heat is released to refining.</p>
        )}
        <div className="flex items-start gap-2 text-xs text-slate-400 pt-2 border-t border-slate-100">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            Chemistry/temperature/samples reports are generated in other modules (P06 Heat Approval) once available —
            melting only produces the Heat Cycle Report above.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
