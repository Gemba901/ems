"use client";

import { MapPinOff } from "lucide-react";
import { useAttendanceCorrections, useAttendanceLocation } from "@/hooks/work/useWork";
import { formatDateOnly, formatDateTime } from "@/lib/work/format";
import type { AttendanceRecord, WorkArrangement } from "@/services/work.service";
import { LocationMap, MapLegend } from "@/components/work/LocationMap";
import { LocationCheckBadge } from "@/components/work/attendance/LocationCheckBadge";
import { ErrorNote, Loading, WorkDialog, errorMessage, secondaryButton } from "@/components/work/ui";

const ARRANGEMENT_SENTENCE: Record<WorkArrangement, string> = {
  ON_SITE: "On-site: compared with company locations.",
  REMOTE: "Remote: compared with their approved home.",
  HYBRID: "Hybrid: compared with company locations and their approved home.",
};

// Coordinates are requested only while this dialog is open. The map draws them on
// OpenStreetMap tiles: the tile server sees the map area viewed, not the coordinates.
function LocationSection({ recordId }: { recordId: string }) {
  const location = useAttendanceLocation(recordId);
  if (location.isLoading) return <Loading label="Loading location…" />;
  if (location.isError || !location.data) return <ErrorNote>{errorMessage(location.error, "Location could not be loaded.")}</ErrorNote>;
  const l = location.data;

  if (l.locationStatus === "MISSING" || l.latitude == null || l.longitude == null) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <MapPinOff className="h-4 w-4 text-slate-500" aria-hidden="true" /> No location was captured at clock-in
        </p>
        <p className="text-sm text-slate-600">
          Reason given: <span className="whitespace-pre-wrap text-slate-800">{l.missingReason || "—"}</span>
        </p>
      </div>
    );
  }
  const place = l.checkedPlace;
  return (
    <div className="space-y-3">
      {l.locationCheck && (
        <div className="space-y-1">
          <LocationCheckBadge check={l.locationCheck} distanceMeters={l.distanceMeters} placeName={place?.name} />
          {l.arrangementAtClockIn && <p className="text-xs text-slate-500">{ARRANGEMENT_SENTENCE[l.arrangementAtClockIn]}</p>}
          {l.locationCheck === "OUTSIDE" && (
            <p className="text-xs text-slate-500">Phone locations can drift or be faked, so treat this as something to ask about, not proof.</p>
          )}
        </div>
      )}
      <LocationMap
        label="Map of the clock-in location"
        point={{ latitude: l.latitude, longitude: l.longitude, accuracyMeters: l.accuracyMeters, label: "Clock-in location" }}
        places={place ? [{ ...place, name: place.kind === "HOME" ? "Approved home" : place.name }] : []}
      />
      <MapLegend point="Clock-in (dashed ring: GPS accuracy)" site={place?.kind === "SITE"} home={place?.kind === "HOME"} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-500">Coordinates</dt>
        <dd className="font-mono text-slate-700">
          {l.latitude.toFixed(6)}, {l.longitude.toFixed(6)}
        </dd>
        <dt className="text-slate-500">Accuracy</dt>
        <dd className="text-slate-700">{l.accuracyMeters != null ? `± ${Math.round(l.accuracyMeters)} m` : "—"}</dd>
      </dl>
    </div>
  );
}

function CorrectionsSection({ record }: { record: AttendanceRecord }) {
  const corrections = useAttendanceCorrections(record.id);
  const tz = record.timezoneAtClockIn;
  const fmt = (iso: string | null) => (iso ? formatDateTime(iso, tz) : "Not clocked out");

  if (corrections.isLoading) return <Loading label="Loading history…" />;
  if (corrections.isError) return <ErrorNote>{errorMessage(corrections.error)}</ErrorNote>;
  const items = corrections.data ?? [];
  if (items.length === 0) return <p className="text-sm text-slate-500">No corrections.</p>;
  return (
    <ol className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="text-xs text-slate-500">
            {formatDateTime(c.createdAt, tz)} by <span className="font-medium text-slate-700">{c.correctedBy?.name ?? "Unknown"}</span>
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Clock in</dt>
            <dd className="text-slate-800">
              {fmt(c.previousClockInAt)} → {fmt(c.correctedClockInAt)}
            </dd>
            <dt className="text-slate-500">Clock out</dt>
            <dd className="text-slate-800">
              {fmt(c.previousClockOutAt)} → {fmt(c.correctedClockOutAt)}
            </dd>
            <dt className="text-slate-500">Reason</dt>
            <dd className="whitespace-pre-wrap text-slate-800">{c.reason}</dd>
          </dl>
        </li>
      ))}
    </ol>
  );
}

/** Location and correction history for one record. Mount only while open. */
export function RecordDetailsDialog({
  record,
  employeeName,
  onClose,
}: {
  record: AttendanceRecord;
  employeeName?: string;
  onClose: () => void;
}) {
  return (
    <WorkDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Attendance on ${formatDateOnly(record.workDate, { weekday: "short" })}`}
      description={employeeName}
      footer={
        <button type="button" className={secondaryButton} onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="space-y-6">
        <section aria-labelledby="record-location-heading" className="space-y-2">
          <h3 id="record-location-heading" className="text-sm font-semibold text-slate-900">
            Location
          </h3>
          <LocationSection recordId={record.id} />
        </section>
        {record.edited && (
          <section aria-labelledby="record-history-heading" className="space-y-2">
            <h3 id="record-history-heading" className="text-sm font-semibold text-slate-900">
              Correction history
            </h3>
            <CorrectionsSection record={record} />
          </section>
        )}
      </div>
    </WorkDialog>
  );
}
