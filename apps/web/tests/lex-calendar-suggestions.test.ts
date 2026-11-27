import assert from "node:assert/strict";
import { test } from "node:test";
import {
  leadershipSuggestionGroups,
  suggestedSelection,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-selection";
import type { CalendarDirectory } from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-audience.types";

const directory: CalendarDirectory = {
  source: "CORE_RECORDS",
  loadedAt: "2026-11-13T00:00:00Z",
  departments: [],
  people: [
    ["ceo", "Zara", "CEO", true],
    ["chief", "Amina", "Chief Operating Officer", true],
    ["hod", "Hema", "HOD Production", true],
    ["head", "Bella", "Head of Finance / Manager", true],
    ["manager", "Malik", "Manager and Supervisor", true],
    ["supervisor", "Susan", "Supervisor", true],
    ["former", "Former CEO", "CEO", false],
    ["unknown", "Unknown", null, true],
    ["operator", "Worker", "Operator", true],
  ].map(([id, name, jobTitle, active]) => ({
    id: id as string,
    name: name as string,
    jobTitle: jobTitle as string | null,
    active: active as boolean,
    code: null,
    departmentId: null,
    branch: null,
  })),
};

test("leadership starts with active top-management title matches, with HODs optional", () => {
  assert.deepEqual(suggestedSelection(directory, "LEADERSHIP").employeeIds, [
    "chief",
    "ceo",
  ]);
  assert.deepEqual(
    suggestedSelection(directory, "LEADERSHIP", { headsOfDepartment: true })
      .employeeIds,
    ["chief", "ceo", "head", "hod"],
  );
});

test("each optional category can be included independently", () => {
  assert.deepEqual(
    suggestedSelection(directory, "LEADERSHIP", { managers: true }).employeeIds,
    ["chief", "ceo", "manager"],
  );
  assert.deepEqual(
    suggestedSelection(directory, "LEADERSHIP", { supervisors: true })
      .employeeIds,
    ["chief", "ceo", "supervisor"],
  );
});

test("groups have a stable order and names are alphabetical; overlapping titles appear once", () => {
  const before = structuredClone(directory);
  const groups = leadershipSuggestionGroups(directory, {
    headsOfDepartment: true,
    managers: true,
    supervisors: true,
  });
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Top management", "Heads of department", "Managers", "Supervisors"],
  );
  assert.deepEqual(
    groups.map((g) => g.people.map((p) => p.id)),
    [["chief", "ceo"], ["head", "hod"], ["manager"], ["supervisor"]],
  );
  assert.deepEqual(directory, before);
});

test("duplicate directory rows do not duplicate a suggested person", () => {
  const duplicated = {
    ...directory,
    people: [...directory.people, { ...directory.people[0] }],
  };
  assert.deepEqual(suggestedSelection(duplicated, "LEADERSHIP").employeeIds, [
    "chief",
    "ceo",
  ]);
});

test("enabled groups remain identifiable when no titles match", () => {
  const empty = { ...directory, people: [] };
  assert.deepEqual(
    leadershipSuggestionGroups(empty, { headsOfDepartment: true }).map((g) => [
      g.label,
      g.people.length,
    ]),
    [
      ["Top management", 0],
      ["Heads of department", 0],
    ],
  );
});
