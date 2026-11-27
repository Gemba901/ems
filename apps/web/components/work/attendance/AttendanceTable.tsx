"use client";

import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { MapPin, MapPinOff, Pencil } from "lucide-react";
import { formatDateOnly, formatDuration, formatMinutes, formatTime } from "@/lib/work/format";
import type { AttendanceRecord, TeamAttendanceRecord } from "@/services/work.service";
import { LocationCheckBadge, needsLocationAttention } from "@/components/work/attendance/LocationCheckBadge";

type Row = AttendanceRecord & { employee?: { id: string; name: string } };

function LocationButton({ record, onOpen }: { record: Row; onOpen: () => void }) {
  const captured = record.locationStatus === "CAPTURED";
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1 rounded text-sm text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
    >
      {captured ? <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> : <MapPinOff className="h-3.5 w-3.5" aria-hidden="true" />}
      {captured ? "Captured" : "Missing"}
      <span className="sr-only"> – view details for {formatDateOnly(record.workDate)}</span>
    </Button>
  );
}

function ClockOut({ record }: { record: Row }) {
  if (record.clockOutAt)
    return (
      <>
        {formatTime(record.clockOutAt, record.timezoneAtClockIn)}
        {record.autoClockedOutAt && <span className="ml-1.5 rounded bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium text-warning">Auto</span>}
      </>
    );
  return <span className="font-medium text-warning">Still clocked in</span>;
}

function LocationFlag({ record }: { record: Row }) {
  if (!needsLocationAttention(record.locationCheck)) return null;
  return <LocationCheckBadge check={record.locationCheck} distanceMeters={record.distanceMeters} placeName={record.checkedPlaceName} compact />;
}

// Against the schedule saved when the person clocked in.
function Punctuality({ record }: { record: Row }) {
  if (record.lateMinutes > 0) {
    return <span className="ml-1.5 rounded bg-warning-subtle px-1.5 py-0.5 text-[11px] font-medium text-warning">Late {formatMinutes(record.lateMinutes)}</span>;
  }
  return null;
}

function LeftEarly({ record }: { record: Row }) {
  if (record.earlyLeaveMinutes <= 0) return null;
  return (
    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
      Left {formatMinutes(record.earlyLeaveMinutes)} early
    </span>
  );
}

function Edited({ record }: { record: Row }) {
  if (!record.edited) return null;
  return <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Edited</span>;
}

// Sessions arrive grouped by day; the date shows once per day, with the day total when there are several.
function isDayStart(records: Row[], i: number) {
  const prev = records[i - 1];
  return !prev || prev.workDate !== records[i].workDate || prev.employeeId !== records[i].employeeId;
}

function DayCell({ record, first }: { record: Row; first: boolean }) {
  const several = record.daySessionCount > 1;
  if (!first)
    return several ? (
      <span className="text-xs text-muted-foreground">
        Session {record.sessionNumber} of {record.daySessionCount}
      </span>
    ) : null;
  return (
    <>
      {formatDateOnly(record.workDate, { weekday: "short" })}
      <Edited record={record} />
      {several && (
        <span className="block text-xs text-muted-foreground">
          {record.daySessionCount} sessions · {formatDuration(record.dayWorkedSeconds)} total
        </span>
      )}
    </>
  );
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
        <Table className="w-full text-left text-sm">
          <TableHeader className="border-b border-border bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <TableRow>
              {showEmployee && (
                <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                  Employee
                </TableHead>
              )}
              <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                Date
              </TableHead>
              <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                Clock in
              </TableHead>
              <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                Clock out
              </TableHead>
              <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                Duration
              </TableHead>
              <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                Location
              </TableHead>
              {onCorrect && (
                <TableHead scope="col" className="px-4 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {records.map((r, i) => (
              <TableRow key={r.id}>
                {showEmployee && <TableCell className="px-4 py-2.5 font-medium text-foreground">{isDayStart(records, i) && r.employee?.name}</TableCell>}
                <TableCell className="whitespace-nowrap px-4 py-2.5 text-foreground">
                  <DayCell record={r} first={isDayStart(records, i)} />
                  {!isDayStart(records, i) && <Edited record={r} />}
                </TableCell>
                <TableCell className="whitespace-nowrap px-4 py-2.5 text-foreground">
                  {formatTime(r.clockInAt, r.timezoneAtClockIn)}
                  <Punctuality record={r} />
                </TableCell>
                <TableCell className="whitespace-nowrap px-4 py-2.5 text-foreground">
                  <ClockOut record={r} />
                  <LeftEarly record={r} />
                </TableCell>
                <TableCell className="whitespace-nowrap px-4 py-2.5 text-foreground">{duration(r)}</TableCell>
                <TableCell className="whitespace-nowrap px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <LocationButton record={r} onOpen={() => onDetails(r)} />
                    <LocationFlag record={r} />
                  </div>
                </TableCell>
                {onCorrect && (
                  <TableCell className="whitespace-nowrap px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => onCorrect(r as TeamAttendanceRecord)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Correct time
                      <span className="sr-only">
                        {" "}
                        for {r.employee?.name} on {formatDateOnly(r.workDate)}
                      </span>
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-border sm:hidden">
        {records.map((r, i) => (
          <li key={r.id} className="space-y-1.5 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                {showEmployee && isDayStart(records, i) && <p className="text-sm font-semibold text-foreground">{r.employee?.name}</p>}
                <p className="text-sm text-foreground">
                  <DayCell record={r} first={isDayStart(records, i)} />
                  {!isDayStart(records, i) && <Edited record={r} />}
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
                <dt className="text-xs text-muted-foreground">In</dt>
                <dd className="text-foreground">{formatTime(r.clockInAt, r.timezoneAtClockIn)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Out</dt>
                <dd className="text-foreground">
                  <ClockOut record={r} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duration</dt>
                <dd className="text-foreground">{duration(r)}</dd>
              </div>
            </dl>
            {onCorrect && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => onCorrect(r as TeamAttendanceRecord)}
                className="inline-flex items-center gap-1 rounded py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Correct time
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
