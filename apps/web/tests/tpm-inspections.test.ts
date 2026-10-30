import test from "node:test";
import assert from "node:assert/strict";
import { sampleAssets } from "../components/tpm/asset-preview";
import {
  createInspectionSnapshot,
  getInspectionProgress,
  inspectionItemHasIssue,
  inspectionPreviewSchema,
  inspectionToday,
  isValidInspectionDate,
  sampleInspectionPreview,
  updateInspection,
  validateChecklist,
  validateInspection,
  type InspectionInspector,
} from "../components/tpm/inspections/inspection-preview";

const inspector = (): InspectionInspector => ({
  userId: "inspector-user-1",
  name: "Preview inspector",
  role: "EMPLOYEE",
  inspectionDate: "2026-10-21",
});

const fixture = () => {
  const checklist = sampleInspectionPreview().checklists[0];
  const asset = sampleAssets()[0];
  const report = createInspectionSnapshot(checklist, asset, inspector(), []);
  return { checklist, asset, report };
};

test("templates are valid, but unpublished checklists and retired assets cannot be inspected", () => {
  const data = sampleInspectionPreview();
  assert.equal(inspectionPreviewSchema.safeParse(data).success, true);
  assert.equal(data.reports.length, 0);
  const { checklist, asset } = fixture();
  assert.throws(
    () =>
      createInspectionSnapshot(
        { ...checklist, status: "Draft" },
        asset,
        inspector(),
        [],
      ),
    /Publish/,
  );
  assert.throws(
    () =>
      createInspectionSnapshot(
        checklist,
        { ...asset, usage: "Retired" },
        inspector(),
        [],
      ),
    /registered asset/,
  );
});

test("inspection keeps asset and checklist snapshots when their sources change", () => {
  const { checklist, asset, report } = fixture();
  const original = structuredClone(report);
  checklist.items[0].title = "Changed check";
  checklist.name = "Renamed template";
  checklist.version += 1;
  asset.name = "Renamed equipment";
  assert.deepEqual(report, original);
  const second = createInspectionSnapshot(checklist, asset, inspector(), [
    report,
  ]);
  assert.equal(second.code, "INSP-0002");
  assert.notEqual(second.items, checklist.items);
});

test("inspector identity, role and inspection date survive save, completion and storage round-trips", () => {
  const { checklist, asset } = fixture();
  const source = { ...inspector(), name: "  Preview inspector  " };
  const report = createInspectionSnapshot(
    checklist,
    asset,
    source,
    [],
    "2026-10-22T09:00:00.000Z",
  );
  source.name = "Renamed user";
  source.role = "MANAGER";
  source.inspectionDate = "2026-10-22";
  const saved = updateInspection(report, {}, "Draft notes");
  const answers = Object.fromEntries(
    saved.items.map((item) => [item.id, { value: "Pass", note: "" }]),
  );
  const complete = updateInspection(saved, answers, "Done", true);
  const restored = inspectionPreviewSchema.parse(
    JSON.parse(
      JSON.stringify({ checklists: [checklist], reports: [complete] }),
    ),
  ).reports[0];
  for (const snapshot of [report, saved, complete, restored]) {
    assert.equal(snapshot.inspectorName, "Preview inspector");
    assert.equal(snapshot.inspectorUserId, "inspector-user-1");
    assert.equal(snapshot.inspectorRole, "EMPLOYEE");
    assert.equal(snapshot.inspectionDate, "2026-10-21");
    assert.equal(snapshot.startedAt, "2026-10-22T09:00:00.000Z");
  }
});

test("older inspection reports retain known names without inventing role, user ID or actual inspection date", () => {
  const { checklist, report } = fixture();
  const legacyReport = Object.fromEntries(
    Object.entries(report).filter(
      ([key]) =>
        !["inspectorUserId", "inspectorRole", "inspectionDate"].includes(key),
    ),
  );
  const restored = inspectionPreviewSchema.parse({
    checklists: [checklist],
    reports: [legacyReport],
  }).reports[0];
  assert.equal(restored.inspectorName, report.inspectorName);
  assert.equal(restored.inspectorUserId, "");
  assert.equal(restored.inspectorRole, "");
  assert.equal(restored.inspectionDate, "");
  assert.deepEqual(
    updateInspection(restored, {}, "Legacy draft").inspectorRole,
    "",
  );
});

test("new inspection snapshots require an identified inspector and a real calendar date", () => {
  const { checklist, asset } = fixture();
  for (const field of ["name", "userId", "role"] as const) {
    assert.throws(
      () =>
        createInspectionSnapshot(
          checklist,
          asset,
          { ...inspector(), [field]: "  " },
          [],
        ),
      /inspector name and role/,
    );
  }
  for (const date of [
    "",
    "2026-02-30",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-01",
    "2026-13-01",
    "2026-10-00",
    "0000-01-01",
    "2026-1-01",
    "2026-10-21T00:00:00Z",
  ]) {
    assert.equal(isValidInspectionDate(date), false, date);
    assert.throws(
      () =>
        createInspectionSnapshot(
          checklist,
          asset,
          { ...inspector(), inspectionDate: date },
          [],
        ),
      /valid inspection date/,
    );
  }
  for (const date of ["2024-02-29", "2000-02-29", "2026-10-21", "2026-12-31"]) {
    assert.equal(isValidInspectionDate(date), true, date);
  }
});

test("inspection dates follow organization midnight and safely fall back to the browser date", () => {
  const now = new Date("2026-10-21T20:00:00.000Z");
  assert.equal(inspectionToday("Asia/Kolkata", now), "2026-10-22");
  assert.equal(inspectionToday("America/Los_Angeles", now), "2026-10-21");
  assert.equal(inspectionToday("UTC", now), "2026-10-21");
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(inspectionToday(undefined, now), local);
  assert.equal(inspectionToday("Invalid/Zone", now), local);
});

test("partial progress persists without completing required checks", () => {
  const { report } = fixture();
  const item = report.items[0];
  const saved = updateInspection(
    report,
    { [item.id]: { value: "Pass", note: " Visual check " } },
    " Shift A ",
  );
  assert.equal(saved.answers[item.id].note, "Visual check");
  assert.equal(saved.notes, "Shift A");
  assert.equal(saved.status, "In progress");
  assert.equal(getInspectionProgress(saved).answered, 1);
  assert.throws(
    () => updateInspection(saved, saved.answers, saved.notes, true),
    /required check/,
  );
  assert.deepEqual(report.answers, {});
});

test("failed findings require notes and completed reports cannot be overwritten", () => {
  const { report } = fixture();
  const answers = Object.fromEntries(
    report.items.map((item) => [item.id, { value: "Pass", note: "" }]),
  );
  answers[report.items[0].id] = { value: "Fail", note: "   " };
  assert.throws(
    () => updateInspection(report, answers, "", true),
    /Describe the issue/,
  );
  answers[report.items[0].id].note = "Visible leak recorded for follow-up";
  const complete = updateInspection(report, answers, "Review requested", true);
  assert.equal(complete.status, "Completed");
  assert.ok(complete.completedAt);
  assert.equal(getInspectionProgress(complete).issues, 1);
  assert.throws(
    () => updateInspection(complete, {}, "overwrite"),
    /cannot be changed/,
  );
  assert.equal(report.status, "In progress");
});

test("numeric readings validate finite input, inclusive limits and issue notes", () => {
  const { report } = fixture();
  const item = {
    ...report.items[0],
    responseType: "Number" as const,
    min: "0",
    max: "10",
  };
  report.items = [item];
  for (const value of ["abc", "Infinity", "NaN"]) {
    report.answers = { [item.id]: { value, note: "" } };
    assert.ok(validateInspection(report)[item.id]);
  }
  for (const value of ["0", "10"]) {
    assert.equal(inspectionItemHasIssue(item, { value, note: "" }), false);
  }
  assert.throws(
    () =>
      updateInspection(
        report,
        { [item.id]: { value: "11", note: "" } },
        "",
        true,
      ),
    /Describe the issue/,
  );
  assert.equal(
    getInspectionProgress(
      updateInspection(
        report,
        { [item.id]: { value: "11", note: "Above range" } },
        "",
        true,
      ),
    ).issues,
    1,
  );
});

test("N/A is explicit, whitespace is unanswered, and invalid checklist ranges are blocked", () => {
  const { report, checklist } = fixture();
  report.items = [{ ...report.items[0], allowNa: false }];
  const id = report.items[0].id;
  report.answers = { [id]: { value: "NA", note: "" } };
  assert.ok(validateInspection(report, true)[id]);
  report.items[0].allowNa = true;
  assert.deepEqual(validateInspection(report, true), {});
  assert.equal(getInspectionProgress(report).naCount, 1);
  report.items[0].responseType = "Text";
  report.answers[id].value = "   ";
  assert.ok(validateInspection(report, true)[id]);
  checklist.items[0] = {
    ...checklist.items[0],
    responseType: "Number",
    min: "10",
    max: "2",
  };
  assert.ok(
    validateChecklist(checklist)[`items.${checklist.items[0].id}.range`],
  );
});
