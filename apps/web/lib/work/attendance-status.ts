import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceStatusResponse,
} from "@/services/work.service";

function invalidResponse(): never {
  throw new Error("Attendance response is incomplete. Please try again.");
}

function validRecord(record: AttendanceRecord): boolean {
  return (
    !!record &&
    typeof record.id === "string" &&
    typeof record.workDate === "string" &&
    typeof record.clockInAt === "string" &&
    Number.isFinite(Date.parse(record.clockInAt)) &&
    (record.clockOutAt === null ||
      (typeof record.clockOutAt === "string" &&
        Number.isFinite(Date.parse(record.clockOutAt))))
  );
}

function closedSeconds(record: AttendanceRecord): number {
  // Open time is added by ClockCard's live timer; never count it twice here.
  if (!record.clockOutAt) return 0;
  if (
    typeof record.durationSeconds === "number" &&
    Number.isFinite(record.durationSeconds) &&
    record.durationSeconds >= 0
  )
    return record.durationSeconds;
  return Math.max(
    0,
    Math.floor(
      (Date.parse(record.clockOutAt) - Date.parse(record.clockInAt)) / 1000,
    ),
  );
}

/** Preserve attendance from both the single-session and multi-session API contracts. */
export function normalizeAttendanceStatus(
  response: AttendanceStatusResponse,
): AttendanceStatus {
  if (
    !response ||
    typeof response !== "object" ||
    typeof response.today !== "string" ||
    typeof response.timeZone !== "string" ||
    !response.todaySchedule ||
    !Number.isFinite(Date.parse(response.serverNow))
  )
    invalidResponse();

  let sessions: AttendanceRecord[];
  if (Array.isArray(response.todaySessions)) {
    sessions = response.todaySessions;
  } else if (response.todayRecord === null) {
    sessions = [];
  } else if (response.todayRecord && validRecord(response.todayRecord)) {
    sessions =
      response.todayRecord.workDate === response.today
        ? [response.todayRecord]
        : [];
  } else {
    // An unrecognised payload is unavailable, not proof of zero attendance.
    invalidResponse();
  }
  if (
    sessions.some((record) => !validRecord(record)) ||
    (response.openRecord && !validRecord(response.openRecord))
  )
    invalidResponse();

  const total = response.todayWorkedSeconds;
  return {
    ...response,
    todaySessions: sessions,
    todayWorkedSeconds:
      typeof total === "number" && Number.isFinite(total) && total >= 0
        ? total
        : sessions.reduce((sum, record) => sum + closedSeconds(record), 0),
  };
}
