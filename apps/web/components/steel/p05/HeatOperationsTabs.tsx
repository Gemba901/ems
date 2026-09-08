"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SimpleTabs } from "@/components/steel/p05/shared";
import { MaterialChargeLog } from "@/components/steel/p05/forms/review-release-forms";
import { HeatCycleDocument } from "@/components/steel/p05/HeatCycleDocument";
import { MeltingService, HEAT_CYCLE_EVENT_LABELS } from "@/services/steel-melting.service";
import type { SteelMelting } from "@/services/steel-melting.service";

type TabKey = "additions" | "events" | "parameters" | "notes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "additions", label: "Material Additions" },
  { key: "events", label: "Events Log" },
  { key: "parameters", label: "Process Parameters" },
  { key: "notes", label: "Notes & Attachments" },
];

/**
 * Read-only "at a glance" tabbed panel — the mockup's Material Additions /
 * Events Log / Process Parameters / Notes & Attachments tabs. Deliberately
 * NOT the container for the gated input forms: those (LiningCheckForm,
 * SystemsCheckForm, AdditionsForm, MonitorMeltForm, etc. in
 * heat-operations-forms.tsx / review-release-forms.tsx) are strictly
 * sequenced by the backend's allowedActions and stay in their existing
 * section-by-section flow below, unchanged. This panel only reorganizes
 * already-recorded, already-fetched data into the tab groupings the mockup
 * shows — no mutation logic lives here.
 */
export function HeatOperationsTabs({ melting, token }: { melting: SteelMelting; token: string }) {
  const [tab, setTab] = useState<TabKey>("additions");

  return (
    <Card>
      <SimpleTabs tabs={TABS} active={tab} onSelect={setTab} />
      <CardContent className="pt-4">
        {tab === "additions" && <AdditionsTab melting={melting} token={token} />}
        {tab === "events" && <EventsLogTab melting={melting} token={token} />}
        {tab === "parameters" && <ProcessParametersTab melting={melting} />}
        {tab === "notes" && <NotesTab melting={melting} token={token} />}
      </CardContent>
    </Card>
  );
}

// P05-A10 extra additions (melting.additions, already on the record) plus
// the full P05-A06/A10 material charge row log (MaterialChargeLog, already
// built and used on the Review & Release screen — reused as-is here, same
// component/query, no duplication of its logic).
function AdditionsTab({ melting, token }: { melting: SteelMelting; token: string }) {
  return (
    <div className="space-y-4">
      {melting.additions && melting.additions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-600 mb-1.5">Extra Additions (P05-A10)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="font-medium py-1.5 pr-3">Item</th>
                  <th className="font-medium py-1.5 pr-3 text-right">Quantity</th>
                  <th className="font-medium py-1.5 pr-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {melting.additions.map((a, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-1.5 pr-3 font-medium text-slate-800">{a.itemName}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-700">{a.quantity}</td>
                    <td className="py-1.5 pr-1 text-slate-600">{a.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <MaterialChargeLog melting={melting} token={token} />
    </div>
  );
}

// Full heat-cycle event log (HeatCycleEvent[] via GET
// /steel/melting/:id/cycle-events) — same query key MonitorMeltForm already
// uses ("heat-cycle-events"), so this shares react-query's cache instead of
// firing a second fetch.
function EventsLogTab({ melting, token }: { melting: SteelMelting; token: string }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["heat-cycle-events", melting.id],
    queryFn: () => MeltingService.getCycleEvents(melting.id, token),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">No events logged for this heat yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100">
            <th className="font-medium py-1.5 pr-3">Time</th>
            <th className="font-medium py-1.5 pr-3">Event</th>
            <th className="font-medium py-1.5 pr-3">Value</th>
            <th className="font-medium py-1.5 pr-3">Notes</th>
            <th className="font-medium py-1.5 pr-1">Recorded By</th>
          </tr>
        </thead>
        <tbody>
          {events
            .slice()
            .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
            .map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">{new Date(e.occurredAt).toLocaleString()}</td>
                <td className="py-1.5 pr-3 font-medium text-slate-800">{HEAT_CYCLE_EVENT_LABELS[e.eventType]}</td>
                <td className="py-1.5 pr-3 text-slate-700">
                  {e.temperatureCelsius !== null ? `${e.temperatureCelsius}°C` : e.quantity !== null ? `${e.quantity}${e.unit ? ` ${e.unit}` : ""}` : "—"}
                </td>
                <td className="py-1.5 pr-3 text-slate-600">{e.notes ?? "—"}</td>
                <td className="py-1.5 pr-1 text-slate-500 whitespace-nowrap">
                  {e.recordedBy.firstName} {e.recordedBy.lastName}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// Real stored numeric parameters (power/temperature elapsed time, tonnage,
// interruptions, output energy) — no computed/invented metrics.
function ProcessParametersTab({ melting }: { melting: SteelMelting }) {
  const items = [
    { label: "Power (kWh)", value: melting.powerKwh !== null ? `${melting.powerKwh} kWh` : null },
    { label: "Power Elapsed", value: melting.powerElapsedMinutes !== null ? `${melting.powerElapsedMinutes} min` : null },
    { label: "Power Tonnage", value: melting.powerTonnage !== null ? `${melting.powerTonnage} t` : null },
    { label: "Temperature (°C)", value: melting.temperatureCelsius !== null ? `${melting.temperatureCelsius} °C` : null },
    { label: "Temperature Elapsed", value: melting.temperatureElapsedMinutes !== null ? `${melting.temperatureElapsedMinutes} min` : null },
    { label: "Total Energy (kWh)", value: melting.outputEnergyTotalKwh !== null ? `${melting.outputEnergyTotalKwh} kWh` : null },
    { label: "Melt Time", value: melting.outputMeltTimeMinutes !== null ? `${melting.outputMeltTimeMinutes} min` : null },
  ].filter((i) => i.value !== null);

  if (items.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-4">No process parameters recorded yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
      {items.map((i) => (
        <div key={i.label}>
          <p className="text-xs text-slate-400">{i.label}</p>
          <p className="font-medium text-slate-800">{i.value}</p>
        </div>
      ))}
    </div>
  );
}

// Free-text notes already captured across the A01-A14 flow, plus the
// generated Heat Cycle Document once the record is closed (HeatCycleDocument,
// already built — reused as-is, same component).
function NotesTab({ melting, token }: { melting: SteelMelting; token: string }) {
  const notes = [
    { label: "Readiness Delay Reason", value: melting.readinessDelayReason },
    { label: "Slag Issue Found", value: melting.slagIssueFound },
    { label: "Additions Summary", value: melting.outputAdditionsSummary },
    { label: "Power Interruptions", value: melting.powerInterruptions },
    { label: "Temperature Delay Reason", value: melting.temperatureDelayReason },
  ].filter((n) => !!n.value);

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">No notes recorded for this heat yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {notes.map((n) => (
            <li key={n.label}>
              <p className="text-xs text-slate-400">{n.label}</p>
              <p className="text-slate-700">{n.value}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-600 mb-1.5">Heat Cycle Document</p>
        {melting.status === "CLOSED" ? (
          <HeatCycleDocument melting={melting} token={token} />
        ) : (
          <p className="text-xs text-slate-400">Available for download once this heat is released to refining.</p>
        )}
      </div>
    </div>
  );
}
