"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Thermometer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MeltingService } from "@/services/steel-melting.service";
import type { SteelMelting } from "@/services/steel-melting.service";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Mockup's "Temperature Monitoring" card — big current-temperature readout
// plus a trend line. Backed entirely by real data: melting.temperatureCelsius
// for "current", and the same TEMPERATURE_READING cycle events already
// queried (same query key "heat-cycle-events") by MonitorMeltForm in
// heat-operations-forms.tsx, so react-query shares one cached fetch instead
// of duplicating it. There is no stored "target range" field on
// SteelMelting, so the mockup's dashed target band is omitted rather than
// invented.
export function TemperatureMonitoringCard({ melting, token }: { melting: SteelMelting; token: string }) {
  const { data: events, isLoading } = useQuery({
    queryKey: ["heat-cycle-events", melting.id],
    queryFn: () => MeltingService.getCycleEvents(melting.id, token),
  });

  const readings = (events ?? [])
    .filter((e) => e.eventType === "TEMPERATURE_READING" && e.temperatureCelsius !== null)
    .slice()
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .map((e) => ({
      time: new Date(e.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      temperature: e.temperatureCelsius as number,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Thermometer className="h-4 w-4 text-slate-500" />
          Temperature Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Current Temperature</p>
            <p className="text-3xl font-bold text-slate-900 leading-tight">
              {melting.temperatureCelsius !== null ? `${melting.temperatureCelsius} °C` : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {readings.length > 0 ? `${readings.length} reading${readings.length === 1 ? "" : "s"} logged` : "No readings logged yet"}
            </p>
          </div>
          <div className="md:col-span-2 h-40">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : readings.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-400">No temperature readings logged for this heat yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={readings} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={["auto", "auto"]} unit="°C" width={50} />
                  <Tooltip formatter={(v) => [`${v} °C`, "Temperature"]} />
                  <Line type="monotone" dataKey="temperature" stroke="#2563eb" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
