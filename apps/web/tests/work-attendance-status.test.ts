import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClockCard } from "../components/work/attendance/ClockCard";
import { normalizeAttendanceStatus } from "../lib/work/attendance-status";
import type {
  AttendanceRecord,
  AttendanceStatusResponse,
} from "../services/work.service";

const record: AttendanceRecord = {
  id: "attendance-1",
  employeeId: "employee-1",
  workDate: "2026-10-30",
  timezoneAtClockIn: "Asia/Kolkata",
  clockInAt: "2026-10-30T03:30:00.000Z",
  clockOutAt: "2026-10-30T05:30:00.000Z",
  isOpen: false,
  durationSeconds: 7200,
  locationStatus: "CAPTURED",
  edited: false,
  lastCorrectedAt: null,
  version: 1,
  scheduledStartAt: null,
  scheduledEndAt: null,
  autoClockedOutAt: null,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  sessionNumber: 1,
  daySessionCount: 1,
  dayWorkedSeconds: 7200,
  locationCheck: null,
  checkedPlaceKind: null,
  checkedPlaceName: null,
  distanceMeters: null,
};
const base: AttendanceStatusResponse = {
  serverNow: "2026-10-30T06:30:00.000Z",
  today: "2026-10-30",
  timeZone: "Asia/Kolkata",
  openRecord: null,
  todaySchedule: {
    dayType: "WORKING",
    holidayName: null,
    startsAt: null,
    endsAt: null,
    lateAfter: null,
  },
};

test("legacy empty attendance returns an empty session list without crashing", () => {
  const result = normalizeAttendanceStatus({ ...base, todayRecord: null });
  assert.deepEqual(result.todaySessions, []);
  assert.equal(result.todayWorkedSeconds, 0);
  assert.equal(
    result.todaySessions[result.todaySessions.length - 1],
    undefined,
  );
});

test("legacy completed attendance retains the session and its worked time", () => {
  const response = { ...base, todayRecord: record };
  const result = normalizeAttendanceStatus(response);
  assert.deepEqual(result.todaySessions, [record]);
  assert.equal(result.todayWorkedSeconds, 7200);
  assert.equal(response.todayRecord, record);
  assert.equal(
    "todaySessions" in response,
    false,
    "normalisation does not mutate cached input",
  );
});

test("legacy open sessions are preserved without adding elapsed time to closed totals", () => {
  const open = {
    ...record,
    clockOutAt: null,
    isOpen: true,
    durationSeconds: null,
  };
  const result = normalizeAttendanceStatus({
    ...base,
    todayRecord: open,
    openRecord: open,
  });
  assert.deepEqual(result.todaySessions, [open]);
  assert.equal(result.openRecord, open);
  assert.equal(result.todayWorkedSeconds, 0);
});

test("a previous day's open record stays open but is not included in today's total", () => {
  const open = {
    ...record,
    workDate: "2026-10-29",
    clockOutAt: null,
    isOpen: true,
  };
  const result = normalizeAttendanceStatus({
    ...base,
    todayRecord: null,
    openRecord: open,
  });
  assert.equal(result.openRecord, open);
  assert.deepEqual(result.todaySessions, []);
  assert.equal(result.todayWorkedSeconds, 0);
});

test("current multi-session responses and explicit zero totals remain authoritative", () => {
  const second = { ...record, id: "attendance-2", durationSeconds: 1800 };
  const response = {
    ...base,
    todaySessions: [record, second],
    todayWorkedSeconds: 9000,
  };
  assert.deepEqual(normalizeAttendanceStatus(response), response);
  assert.equal(
    normalizeAttendanceStatus({ ...response, todayWorkedSeconds: 0 })
      .todayWorkedSeconds,
    0,
  );
  assert.deepEqual(
    normalizeAttendanceStatus({
      ...base,
      todaySessions: [],
      todayRecord: record,
    }).todaySessions,
    [],
  );
});

test("missing totals sum only closed sessions and can use valid timestamps", () => {
  const timed = { ...record, durationSeconds: null };
  const open = {
    ...record,
    id: "attendance-2",
    clockOutAt: null,
    isOpen: true,
  };
  assert.equal(
    normalizeAttendanceStatus({ ...base, todaySessions: [timed, open] })
      .todayWorkedSeconds,
    7200,
  );
  assert.equal(
    normalizeAttendanceStatus({
      ...base,
      todaySessions: null,
      todayRecord: timed,
    }).todayWorkedSeconds,
    7200,
  );
});

test("unrecognised and broken payloads fail safely instead of reporting no attendance", () => {
  for (const response of [
    undefined,
    null,
    {},
    base,
    { ...base, todaySessions: [null] },
  ]) {
    assert.throws(
      () => normalizeAttendanceStatus(response as AttendanceStatusResponse),
      /Attendance response is incomplete/,
    );
  }
});

function renderClock(response: AttendanceStatusResponse, compact: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // No signed-in user in this test: no network requests, but cached responses
  // still pass through the same select function used by the real dashboard.
  client.setQueryData(["work", "", "", "attendance", "status"], response);
  try {
    return renderToStaticMarkup(
      createElement(QueryClientProvider, { client }, createElement(ClockCard, { compact })),
    );
  } finally {
    client.clear();
  }
}

test("dashboard and full ClockCard render cached legacy responses without length/filter errors", () => {
  for (const compact of [true, false]) {
    const empty = renderClock({ ...base, todayRecord: null }, compact);
    assert.match(empty, /Clock in/);
    const closed = renderClock({ ...base, todayRecord: record }, compact);
    assert.match(closed, compact ? /02:00:00/ : /Clocked out/);
    const open = {
      ...record,
      clockOutAt: null,
      durationSeconds: null,
      isOpen: true,
    };
    assert.match(
      renderClock({ ...base, todayRecord: open, openRecord: open }, compact),
      /Clock out/,
    );
  }
});

test("ClockCard shows its existing retry state for an incomplete response instead of crashing", () => {
  for (const compact of [true, false])
    assert.match(renderClock(base, compact), /Try again/);
});
