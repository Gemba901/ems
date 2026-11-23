import { initialRules, type CalendarRules } from "./calendar-model";
import { parseRules } from "./calendar-validation";
import {
  emptyAudience,
  parseAudience,
  audienceIssue,
} from "./calendar-audience";
import {
  assignmentConflicts,
  compareCalendars,
  currentAssignment,
  validateAudienceReferences,
  type PublishedCalendar,
} from "./calendar-assignments";
import type {
  CalendarAudience,
  CalendarDirectory,
} from "./calendar-audience.types";
import { CoreCalendarPeopleSource } from "./calendar-people.source";
import { Prisma } from "db";
const person = (id: string, departmentId = "office", active = true) => ({
  id,
  name: `Person ${id}`,
  code: id,
  jobTitle: "Operator",
  departmentId,
  branch: "Same branch",
  active,
});
const directory: CalendarDirectory = {
  source: "CORE_RECORDS",
  loadedAt: "2027-01-01T00:00:00Z",
  departments: [
    { id: "office", name: "Office" },
    { id: "ops", name: "Operations" },
  ],
  people: [
    person("a"),
    person("b", "ops"),
    person("c", "ops"),
    person("inactive", "office", false),
  ],
};
const audience = (
  kind: CalendarAudience["kind"],
  ids: string[] = [],
): CalendarAudience => ({
  ...emptyAudience(),
  kind,
  label: kind,
  departmentIds: kind === "DEPARTMENTS" ? ids : [],
  employeeIds: kind === "PEOPLE" ? ids : [],
});
const cal = (id: string, a?: CalendarAudience): PublishedCalendar => ({
  id,
  version: 1,
  rules: { ...initialRules(2027), name: id, ...(a ? { audience: a } : {}) },
});
describe("calendar assignment semantics", () => {
  it("keeps legacy calendars unassigned and does not guess a default from their names", () => {
    expect(
      currentAssignment(directory.people[0], "2027-01-02", [
        cal("Company default"),
      ]).status,
    ).toBe("UNASSIGNED");
    expect(parseRules(initialRules(2027))).not.toHaveProperty("audience");
  });
  it("selects named group before department before company, including a non-working day", () => {
    const all = cal("Company", audience("COMPANY")),
      dept = cal("Office", audience("DEPARTMENTS", ["office"])),
      group = cal("Night team", audience("PEOPLE", ["a"]));
    all.rules.workdays = [0, 1, 2, 3, 4, 5, 6];
    expect(
      currentAssignment(directory.people[0], "2027-01-02", [all, dept, group]),
    ).toMatchObject({
      status: "ASSIGNED",
      calendarId: "Night team",
      version: 1,
    });
    expect(
      currentAssignment(directory.people[0], "2027-01-02", [all, dept])
        .calendarId,
    ).toBe("Office");
    expect(
      currentAssignment(directory.people[1], "2027-01-02", [all, dept])
        .calendarId,
    ).toBe("Company");
    const view = compareCalendars("2027-01", directory, [all, dept, group]);
    expect(
      view.rows.find((r) => r.calendarId === "Night team")!.cells[1],
    ).toMatchObject({ working: false, effectivePeople: 1 });
    expect(view.days[1]).toMatchObject({
      assigned: 3,
      conflicts: 0,
      unassigned: 0,
    });
  });
  it("never silently picks the first or newest equal-priority assignment", () => {
    const first = cal("First", audience("PEOPLE", ["a"])),
      second = { ...cal("Second", audience("PEOPLE", ["a"])), version: 9 };
    const result = currentAssignment(directory.people[0], "2027-01-01", [
      first,
      second,
    ]);
    expect(result).toMatchObject({
      status: "CONFLICT",
      candidates: expect.any(Array),
    });
    expect(result).not.toHaveProperty("calendarId");
    expect(result.candidates).toHaveLength(2);
    const view = compareCalendars("2027-01", directory, [first, second]);
    expect(view.days[0]).toMatchObject({
      assigned: 0,
      conflicts: 1,
      unassigned: 2,
    });
    expect(
      view.rows.every(
        (r) => r.cells[0].conflicts === 1 && r.cells[0].effectivePeople === 0,
      ),
    ).toBe(true);
  });
  it("matches department transfers dynamically but named groups remain explicit", () => {
    const office = cal("Office", audience("DEPARTMENTS", ["office"])),
      ops = cal("Ops", audience("DEPARTMENTS", ["ops"])),
      group = cal("Group", audience("PEOPLE", ["a"]));
    expect(
      currentAssignment(person("a", "ops"), "2027-01-01", [office, ops])
        .calendarId,
    ).toBe("Ops");
    expect(
      currentAssignment(person("a", "ops"), "2027-01-01", [office, ops, group])
        .calendarId,
    ).toBe("Group");
    expect(
      currentAssignment(person("new", "ops"), "2027-01-01", [group]).status,
    ).toBe("UNASSIGNED");
  });
  it("excludes inactive people, uses date bounds inclusively and can fall back after a specific calendar ends", () => {
    const all = cal("Default", audience("COMPANY")),
      group = cal("January", audience("PEOPLE", ["a"]));
    group.rules.end = "2027-01-31";
    expect(
      currentAssignment(directory.people[0], "2027-01-31", [all, group])
        .calendarId,
    ).toBe("January");
    expect(
      currentAssignment(directory.people[0], "2027-02-01", [all, group])
        .calendarId,
    ).toBe("Default");
    expect(
      currentAssignment(directory.people[3], "2027-01-01", [all]).status,
    ).toBe("INACTIVE");
    expect(() =>
      currentAssignment(directory.people[0], "2027-02-30", [all]),
    ).toThrow(/valid/);
  });
  it("blocks same-level overlaps but permits separate dates and different priority levels", () => {
    const a = cal("A", audience("DEPARTMENTS", ["office"])),
      b = cal("B", audience("DEPARTMENTS", ["office", "ops"]));
    expect(assignmentConflicts(a.rules, undefined, [b])).toHaveLength(1);
    expect(assignmentConflicts(a.rules, "A", [a])).toEqual([]);
    b.rules.start = "2028-01-01";
    expect(assignmentConflicts(a.rules, undefined, [b])).toEqual([]);
    expect(
      assignmentConflicts(a.rules, undefined, [
        cal("Company", audience("COMPANY")),
        cal("People", audience("PEOPLE", ["a"])),
      ]),
    ).toEqual([]);
  });
  it("reports explicit working-day overrides, reasons, time zones and out-of-cycle cells", () => {
    const a = cal("Kenya Office", audience("PEOPLE", ["a"]));
    a.rules.country = "KE";
    a.rules.start = "2027-01-02";
    a.rules.exceptions = [
      {
        date: "2027-01-02",
        kind: "WORKING",
        reason: "Stock count",
        source: "MANUAL",
      },
    ];
    const b = cal("Uganda Operations", audience("PEOPLE", ["b"]));
    b.rules.country = "UG";
    b.rules.timeZone = "Africa/Kampala";
    const result = compareCalendars("2027-01", directory, [a, b]);
    expect(result.rows[0].cells[0]).toMatchObject({
      working: null,
      reason: "Outside this cycle",
      effectivePeople: 0,
    });
    expect(result.rows[0].cells[1]).toMatchObject({
      working: true,
      reason: "Stock count",
      effectivePeople: 1,
    });
    expect(result.rows[1]).toMatchObject({
      country: "UG",
      timeZone: "Africa/Kampala",
    });
    expect(result.rows[1].cells[1]).toMatchObject({
      working: false,
      reason: "Outside normal working week",
    });
    expect(JSON.stringify(result)).not.toContain('"employeeIds"');
    expect(JSON.stringify(result)).not.toContain("Person a");
  });
  it("returns complete leap/non-leap months and refuses malformed ranges", () => {
    expect(compareCalendars("2028-02", directory, []).days).toHaveLength(29);
    expect(compareCalendars("2027-02", directory, []).days).toHaveLength(28);
    for (const month of ["2027-13", "2027-2", "2027-02-01", "1899-12"])
      expect(() => compareCalendars(month, directory, [])).toThrow();
  });
  it("reports unavailable selections without exposing another company's records", () => {
    expect(
      validateAudienceReferences(audience("PEOPLE", ["foreign"]), directory)[0],
    ).toMatch(/not|no longer/);
    expect(
      validateAudienceReferences(
        audience("DEPARTMENTS", ["foreign"]),
        directory,
      ),
    ).toHaveLength(1);
  });
  it("validates bounded identities and rejects hidden selections for other kinds", () => {
    expect(
      parseAudience({ ...audience("PEOPLE"), employeeIds: [" a ", "a"] })
        .employeeIds,
    ).toEqual(["a"]);
    expect(() =>
      parseAudience({ ...audience("COMPANY"), employeeIds: ["a"] }),
    ).toThrow(/selections/);
    expect(() =>
      parseAudience({
        ...audience("PEOPLE"),
        employeeIds: Array(3001).fill("a"),
      }),
    ).toThrow(/3000/);
    expect(() =>
      parseAudience({ ...audience("PEOPLE"), employeeIds: [{}] }),
    ).toThrow();
    expect(() =>
      parseAudience({ ...audience("PEOPLE"), label: "x".repeat(81) }),
    ).toThrow();
    expect(audienceIssue({ ...audience("PEOPLE", ["a"]), label: "" })).toMatch(
      /name/,
    );
    expect(audienceIssue(audience("DEPARTMENTS"))).toMatch(/department/);
  });
  it("reads only company-scoped work directory fields and preserves stable IDs", async () => {
    const tx = {
      department: {
        findMany: jest.fn().mockResolvedValue(directory.departments),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "a",
            firstName: "Amina",
            middleName: null,
            lastName: "M",
            employeeCode: "A1",
            jobTitle: "Operator",
            departmentId: "ops",
            plantBranch: " Plant ",
            employmentStatus: "PROBATION",
          },
        ]),
      },
    };
    const result = await new CoreCalendarPeopleSource().read(
      tx as unknown as Prisma.TransactionClient,
      "org-a",
    );
    expect(tx.employee.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-a",
    });
    expect(tx.department.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-a",
    });
    expect(result.people[0]).toMatchObject({
      id: "a",
      name: "Amina M",
      branch: "Plant",
      active: true,
    });
    const select = tx.employee.findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty("email");
    expect(select).not.toHaveProperty("phone");
    expect(select).not.toHaveProperty("nationalId");
  });
});
