"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeltingService, SteelMelting, HeatSummary } from "@/services/steel-melting.service";
import { HEAT_CYCLE_EVENT_LABELS } from "@/services/steel-melting.service";

// Reuses the same client-side workbook-export pattern as
// apps/web/app/sims/analytics/page.tsx (dynamic `xlsx` import, no backend
// PDF/report generation exists anywhere in the steel module). Purely
// aggregates data already available from existing GET endpoints — no new
// business logic or computed values beyond what getHeatSummary already
// returns.
export function HeatCycleDocument({ melting, token }: { melting: SteelMelting; token: string }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const [summary, charges, events] = await Promise.all([
        MeltingService.getHeatSummary(melting.id, token) as Promise<HeatSummary>,
        MeltingService.getMaterialCharges(melting.id, token),
        MeltingService.getCycleEvents(melting.id, token),
      ]);

      const identificationAoa: (string | number)[][] = [
        ["Heat Cycle Report"],
        [`Heat-in-Process No.: ${melting.heatInProcessNumber}`],
        [`Generated: ${new Date().toLocaleString()}`],
        [],
        ["Field", "Value"],
        ["Furnace", melting.furnace ? `${melting.furnace.code} — ${melting.furnace.name}` : (melting.furnaceId ?? "—")],
        ["Charge Preparation", melting.chargePreparation?.prepNumber ?? "—"],
        ["Charge ID", melting.chargeNumberSnapshot ?? "—"],
        ["Operator", melting.operatorName ?? "—"],
        ["Shift", melting.shift ?? "—"],
        ["Status", melting.status],
        ["Stage", melting.stage],
        ["Melting Start", melting.meltingStartTime ? new Date(melting.meltingStartTime).toLocaleString() : "—"],
        ["Handed Over to Refining", melting.handoverToRefiningAt ? new Date(melting.handoverToRefiningAt).toLocaleString() : "—"],
        [],
        ["Material Balance", ""],
        ["Total Material Input", summary.totalMaterialInput],
        ["Total Output (t)", summary.totalOutputTonnes ?? "—"],
        ["Material Loss (t)", summary.materialLossTonnes ?? "—"],
        ["Yield %", summary.yieldPercent !== null ? `${summary.yieldPercent.toFixed(1)}%` : "Not available"],
        [],
        ["Cycle Performance", ""],
        ["Cycle Duration (min)", summary.cycleDurationMinutes !== null ? Math.round(summary.cycleDurationMinutes) : "—"],
        ["Liquid Temperature (°C)", melting.liquidTemperatureCelsius ?? "—"],
        ["Output Energy Total (kWh)", melting.outputEnergyTotalKwh ?? "—"],
        ["Energy / Tonne", "Not available — formula not yet defined"],
        ["Lining Heats Completed", summary.lining ? summary.lining.heatsCompleted : "—"],
      ];
      const identificationSheet = XLSX.utils.aoa_to_sheet(identificationAoa);
      identificationSheet["!cols"] = [{ wch: 28 }, { wch: 30 }];

      const chargesAoa: (string | number)[][] = [
        ["#", "Material", "Category", "Grade", "Batch", "Planned Qty", "Actual Qty", "Unit", "Charged At"],
        ...charges.map((c) => [
          c.sequence,
          c.material,
          c.materialCategory,
          c.grade ?? "—",
          c.batchRef ?? "—",
          c.plannedQuantity ?? "—",
          c.actualQuantity,
          c.unit,
          new Date(c.chargedAt).toLocaleString(),
        ]),
      ];
      const chargesSheet = XLSX.utils.aoa_to_sheet(chargesAoa);
      chargesSheet["!cols"] = [{ wch: 4 }, { wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 20 }];

      const eventsAoa: (string | number)[][] = [
        ["Occurred At", "Event", "Temp (°C)", "Quantity", "Unit", "Notes"],
        ...events.map((e) => [
          new Date(e.occurredAt).toLocaleString(),
          HEAT_CYCLE_EVENT_LABELS[e.eventType],
          e.temperatureCelsius ?? "—",
          e.quantity ?? "—",
          e.unit ?? "—",
          e.notes ?? "—",
        ]),
      ];
      const eventsSheet = XLSX.utils.aoa_to_sheet(eventsAoa);
      eventsSheet["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 30 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, identificationSheet, "Summary");
      XLSX.utils.book_append_sheet(workbook, chargesSheet, "Material Charges");
      XLSX.utils.book_append_sheet(workbook, eventsSheet, "Events");

      XLSX.writeFile(workbook, `Heat-Cycle-Report-${melting.heatInProcessNumber}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the report.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button size="sm" variant="outline" disabled={downloading} onClick={handleDownload} className="gap-2">
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {downloading ? "Generating..." : "Download Heat Cycle Report"}
      </Button>
    </div>
  );
}
