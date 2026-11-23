import { approvedCalendarSummaries, departmentAssignment, type PublishedCalendar } from "./calendar-assignments";
import { initialRules } from "./calendar-model";
import type { CalendarAudience } from "../../common/contracts";

const audience = (kind: CalendarAudience["kind"], ids: Partial<CalendarAudience> = {}): CalendarAudience =>
  ({ kind, label: "", departmentIds: [], employeeIds: [], ...ids });
const calendar = (id: string, name: string, a: CalendarAudience, start = "2027-01-01", end = "2027-12-31"): PublishedCalendar =>
  ({ id, version: 1, rules: { ...initialRules(2027), name, start, end, audience: a } });

describe("Area 02 calendar contract: department lookup", () => {
  const company = calendar("co", "Company 2027", audience("COMPANY"));
  const production = calendar("prod", "Production 2027", audience("DEPARTMENTS", { departmentIds: ["d-prod"] }));
  it("uses the department's own calendar first, otherwise the company-wide one", () => {
    expect(departmentAssignment("d-prod", "2027-03-01", [company, production])).toMatchObject({ status: "ASSIGNED", calendarId: "prod", version: 1 });
    expect(departmentAssignment("d-sales", "2027-03-01", [company, production])).toMatchObject({ status: "ASSIGNED", calendarId: "co" });
  });
  it("never guesses on a tie at the same level, and reports dates no calendar covers", () => {
    const second = calendar("prod2", "Production B", audience("DEPARTMENTS", { departmentIds: ["d-prod"] }));
    const tie = departmentAssignment("d-prod", "2027-03-01", [company, production, second]);
    expect(tie.status).toBe("CONFLICT");
    expect(tie.calendarId).toBeUndefined();
    expect(tie.candidates.map((c) => c.calendarId).sort()).toEqual(["prod", "prod2"]);
    expect(departmentAssignment("d-prod", "2028-01-05", [company, production])).toEqual({ status: "UNASSIGNED", basis: "CURRENT_PEOPLE_RECORDS", candidates: [] });
  });
  it("ignores calendars for selected people and rejects invalid dates", () => {
    const people = calendar("ppl", "Leaders", audience("PEOPLE", { employeeIds: ["e1"] }));
    expect(departmentAssignment("d-prod", "2027-03-01", [people]).status).toBe("UNASSIGNED");
    expect(() => departmentAssignment("d-prod", "2027-02-30", [people])).toThrow();
  });
});

describe("Area 02 calendar contract: approved calendars for selection", () => {
  it("lists each current approved calendar with its audience and reportable frequencies, by start date", () => {
    const later = calendar("b", "Production 2027", audience("DEPARTMENTS", { departmentIds: ["d"] }), "2027-07-01", "2028-06-30");
    const earlier = { ...calendar("a", "Company 2027", audience("COMPANY")), version: 3 };
    earlier.rules.enabledFrequencies = ["monthly", "quarterly", "yearly"];
    const list = approvedCalendarSummaries([later, earlier]);
    expect(list.map((c) => c.calendarId)).toEqual(["a", "b"]);
    expect(list[0]).toMatchObject({ version: 3, name: "Company 2027", start: "2027-01-01", end: "2027-12-31", timeZone: "Africa/Nairobi",
      audience: { kind: "COMPANY" }, frequencies: ["monthly", "quarterly", "yearly"] });
    expect(list[1].audience.kind).toBe("DEPARTMENTS");
    expect(typeof list[1].audience.label).toBe("string");
  });
});
