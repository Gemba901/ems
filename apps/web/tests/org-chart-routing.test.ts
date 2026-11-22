import test from "node:test";
import assert from "node:assert/strict";
import {
  branchKey,
  colourGroups,
  coloursFor,
  initialState,
  normaliseBranchView,
  readView,
  viewUrl,
  type Person,
} from "../components/ems/org-chart-v3/model";
import { PALETTE, LIGHT_PALETTE } from "../components/ems/org-chart-v3/model";
import { coloursForGroups } from "../components/ems/branch-colours";
import { personBranchKey } from "../components/ems/onboarding-person-search";
import { normaliseKey } from "../../api/src/ems/onboarding-text";
import {
  canViewDepartments,
  departmentFromChartHref,
  isOrgChartAddress,
  ORG_CHART_PATH,
} from "../components/ems/organisation-navigation";
import { departmentsBackHref } from "../components/ems/department-directory";

const person = (
  id: string,
  branchText: string,
  status = "ACTIVE",
  department: Person["department"] = null,
): Person => ({
  id,
  name: id,
  branchText,
  status,
  department,
  branch: null,
  jobTitle: null,
  managerId: null,
  reportsToBody: null,
  photoUrl: null,
});

test("chart branch keys match the existing API rule, including the ampersand distinction", () => {
  for (const label of [
    " Head - Office (Main) ",
    "HEAD OFFICE",
    "Pipes / Profiles",
    "Pipes & Profiles",
    "Pipes and Profiles",
    "Roto\nMoulding",
    "",
    "(notes)",
  ])
    assert.equal(branchKey(person("p", label)), normaliseKey(label));
  assert.notEqual(
    personBranchKey("Pipes & Profiles"),
    personBranchKey("Pipes and Profiles"),
  );
});

test("branch ranking uses whole-company people, probation and unassigned departments with the directory's display spelling", () => {
  const people = [
    person("a", " Head Office "),
    person("b", "Head Office", "PROBATION"),
    person("c", "HEAD-OFFICE (Main)", "INACTIVE"),
    person("d", "Plant", "ACTIVE", { id: "dep", name: "Production" }),
    person("e", "Plant", "INACTIVE"),
    person("f", "Pipes & Profiles"),
    person("g", "Pipes and Profiles"),
  ];
  const directoryBranches = [
    { id: "headoffice", name: "Head Office", people: 3, activePeople: 2 },
    { id: "plant", name: "Plant", people: 2, activePeople: 1 },
    {
      id: "pipesprofiles",
      name: "Pipes & Profiles",
      people: 1,
      activePeople: 1,
    },
    {
      id: "pipesandprofiles",
      name: "Pipes and Profiles",
      people: 1,
      activePeople: 1,
    },
  ];
  const groups = colourGroups(people, "branch").main;
  assert.equal(groups[0].name, "Head Office");
  assert.deepEqual(
    [...coloursFor(people, "branch")],
    [...coloursForGroups(directoryBranches)],
  );
  assert.deepEqual(
    colourGroups(people, "branch"),
    colourGroups([...people].reverse(), "branch"),
  );
});

test("shared defaults and chart custom slots/pastels remain distinct", () => {
  const people = Array.from({ length: 16 }, (_, n) =>
    person(String(n), `Branch ${String(n).padStart(2, "0")}`),
  );
  const { main, others } = colourGroups(people, "branch");
  assert.equal(main.length, 13);
  assert.equal(others.length, 3);
  assert.deepEqual(
    [...coloursFor(people, "branch")],
    [...coloursForGroups([...main, ...others])],
  );
  const ids = [main[0].id, others[1].id];
  const slots = [ids[0], "", ids[1]];
  assert.equal(
    coloursFor(people, "branch", ids, true, slots).get(ids[1]),
    PALETTE[2],
  );
  assert.equal(
    coloursFor(people, "branch", ids, true, slots, "lighter").get(ids[1]),
    LIGHT_PALETTE[2],
  );
});

test("legacy raw branch filters convert without dropping query, department, focus or opened teams", () => {
  const state = {
    ...initialState(),
    branch: "HEAD OFFICE (Main)",
    query: "jac",
    departments: ["dep"],
    expanded: ["ceo", "manager"],
    selected: "jac",
    inactive: true,
  };
  const next = normaliseBranchView(state, [person("p", "Head Office")]);
  assert.deepEqual(next, { ...state, branch: "headoffice" });
  assert.equal(
    normaliseBranchView({ ...state, branch: "Removed Branch" }, []).branch,
    "removedbranch",
  );
  assert.equal(state.branch, "HEAD OFFICE (Main)");
});

test("legacy IDs and merged spelling variants retain the first colour slot and other selected slots", () => {
  const people = [
    {
      ...person("a", ""),
      branch: { id: "legacy-north-a", name: "North (Main)" },
    },
    { ...person("b", ""), branch: { id: "legacy-north-b", name: "NORTH" } },
    person("c", "South"),
  ];
  const state = {
    ...initialState(),
    branch: "legacy-north-a",
    colourBy: "branch" as const,
    colourMode: "custom" as const,
    colourFocus: ["legacy-north-a", "South", "legacy-north-b"],
    colourSlots: ["legacy-north-a", "", "South", "legacy-north-b"],
  };
  const next = normaliseBranchView(state, people);
  assert.equal(next.branch, "north");
  assert.deepEqual(next.colourFocus, ["north", "south"]);
  assert.deepEqual(next.colourSlots, ["north", "", "south"]);
  assert.deepEqual(normaliseBranchView(readView(viewUrl(next)), people), {
    ...next,
    expanded: [],
  });
});

test("branch migration never rewrites department colour IDs", () => {
  const state = {
    ...initialState(),
    branch: "Head Office",
    colourMode: "custom" as const,
    colourFocus: ["Dept-ID"],
    colourSlots: ["", "Dept-ID"],
  };
  const next = normaliseBranchView(state, []);
  assert.deepEqual(next.colourFocus, state.colourFocus);
  assert.deepEqual(next.colourSlots, state.colourSlots);
});

test("only the three agreed roles see Departments navigation", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN", "HR"])
    assert(canViewDepartments(role));
  for (const role of [
    "MANAGEMENT",
    "HOD",
    "EMPLOYEE",
    "admin",
    "",
    null,
    undefined,
  ])
    assert(!canViewDepartments(role));
});

test("department links return to the exact canonical chart query and retain branch scope", () => {
  const view =
    "scope=all&query=jackson&department=a&department=b&selected=person-1&branch=headoffice";
  const href = new URL(
    departmentFromChartHref("dept/a", view, "headoffice"),
    "https://example.test",
  );
  assert.equal(href.pathname, "/ems/organisation/departments/dept%2Fa");
  assert.equal(href.searchParams.get("branch"), "headoffice");
  assert.equal(
    departmentsBackHref(href.searchParams.get("from")),
    `${ORG_CHART_PATH}?${view}&chartReturn=1`,
  );
  assert(isOrgChartAddress(href.searchParams.get("from")!));
});

test("department Back allows only the list and explicit chart routes", () => {
  for (const target of [
    "/ems/organisation?view=HODS",
    ORG_CHART_PATH,
    `${ORG_CHART_PATH}?query=jackson&department=a&department=b`,
    `${ORG_CHART_PATH}-v3?selected=x`,
  ])
    assert.equal(departmentsBackHref(target), target);
  for (const target of [
    "https://evil.test/ems/organisation/chart",
    "//evil.test",
    "/ems/organisation/chart-evil",
    "/ems/organisation/chart/../../login",
    "/ems/organisation/departments/x",
    "/ems/organisationX",
  ])
    assert.equal(departmentsBackHref(target), "/ems/organisation");
});
