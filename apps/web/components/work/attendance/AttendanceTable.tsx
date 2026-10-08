"use client";

import { MapPin, MapPinOff, Pencil } from "lucide-react";
import { formatDateOnly, formatDuration, formatMinutes, formatTime } from "@/lib/work/format";
import type { AttendanceRecord, TeamAttendanceRecord } from "@/services/work.service";
import { LocationCheckBadge, needsLocationAttention } from "@/components/work/attendance/LocationCheckBadge";

type Row = AttendanceRecord & { employee?: { id: string; name: string } };

function LocationButton({ record, onOpen }: { record: Row; onOpen: () => void }) {
  const captured = record.locationStatus === "CAPTURED";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded text-sm text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {captured ? <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPinOff className="h-3.5 w-3.5" aria-hidden="true" />}
      {captured ? "Captured" : "Missing"}
      <span className="sr-only"> – view details for {formatDateOnly(record.workDate)}</span>
    </button>
  );
}

function ClockOut({ record }: { record: Row }) {
  if (record.clockOutAt) return <>{formatTime(record.clockOutAt, record.timezoneAtClockIn)}</>;
  return <span className="font-medium text-amber-700">Still clocked in</span>;
}

function LocationFlag({ record }: { record: Row }) {
  if (!needsLocationAttention(record.locationCheck)) return null;
  return <LocationCheckBadge check={record.locationCheck} distanceMeters={record.distanceMeters} placeName={record.checkedPlaceName} compact />;
}

// Against the schedule saved when the person clocked in.
function Punctuality({ record }: { record: Row }) {
  if (record.lateMinutes > 0) {
    return (
      <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
        Late {formatMinutes(record.lateMinutes)}
      </span>
    );
  }
  return null;
}

function LeftEarly({ record }: { record: Row }) {
  if (record.earlyLeaveMinutes <= 0) return null;
  return (
    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">
      Left {formatMinutes(record.earlyLeaveMinutes)} early
    </span>
  );
}

function Edited({ record }: { record: Row }) {
  if (!record.edited) return null;
  return <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">Edited</span>;
}

/** A table on wider screens, stacked rows on phones. Times are shown in the zone the day was recorded in. */
export function AttendanceTable({
  records,
  showEmployee,
  onDetails,
  onCorrect,
}: {
  records: Row[];
  showEmployee: boolean;
  onDetails: (record: Row) => void;
  onCorrect?: (record: TeamAttendanceRecord) => void;
}) {
  const duration = (r: Row) => (r.durationSeconds != null ? formatDuration(r.durationSeconds) : "—");

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {showEmployee && <th scope="col" className="px-4 py-2.5 font-semibold">Employee</th>}
              <th scope="col" className="px-4 py-2.5 font-semibold">Date</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Clock in</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Clock out</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Duration</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Location</th>
              {onCorrect && (
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => (
              <tr key={r.id}>
                {showEmployee && <td className="px-4 py-2.5 font-medium text-slate-900">{r.employee?.name}</td>}
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                  {formatDateOnly(r.workDate, { weekday: "short" })}
                  <Edited record={r} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                  {formatTime(r.clockInAt, r.timezoneAtClockIn)}
                  <Punctuality record={r} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                  <ClockOut record={r} />
                  <LeftEarly record={r} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-800">{duration(r)}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <LocationButton record={r} onOpen={() => onDetails(r)} />
                    <LocationFlag record={r} />
                  </div>
                </td>
                {onCorrect && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onCorrect(r as TeamAttendanceRecord)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Correct time
                      <span className="sr-only">
                        {" "}
                        for {r.employee?.name} on {formatDateOnly(r.workDate)}
                      </span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 sm:hidden">
        {records.map((r) => (
          <li key={r.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                {showEmployee && <p className="text-sm font-semibold text-slate-900">{r.employee?.name}</p>}
                <p className="text-sm text-slate-800">
                  {formatDateOnly(r.workDate, { weekday: "short" })}
                  <Edited record={r} />
                </p>
              </div>
              <LocationButton record={r} onOpen={() => onDetails(r)} />
            </div>
            {(r.lateMinutes > 0 || r.earlyLeaveMinutes > 0) && (
              <p className="-ml-1.5">
                <Punctuality record={r} />
                <LeftEarly record={r} />
              </p>
            )}
            <LocationFlag record={r} />
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">In</dt>
                <dd className="text-slate-800">{formatTime(r.clockInAt, r.timezoneAtClockIn)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Out</dt>
                <dd className="text-slate-800">
                  <ClockOut record={r} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Duration</dt>
                <dd className="text-slate-800">{duration(r)}</dd>
              </div>
            </dl>
            {onCorrect && (
              <button
                type="button"
                onClick={() => onCorrect(r as TeamAttendanceRecord)}
                className="inline-flex items-center gap-1 rounded py-1 text-sm text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Correct time
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
