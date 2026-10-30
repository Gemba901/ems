import test from "node:test";
import assert from "node:assert/strict";
import { sampleAssets } from "../components/tpm/asset-preview";
import {
  createCheckupSnapshot,
  evaluateHealthReport,
  healthCheckupPreviewSchema,
  healthItemHasIssue,
  healthToday,
  isValidHealthDate,
  linkWorkOrderToCheckup,
  markCheckupVerified,
  previousCheckupsForAsset,
  sampleHealthCheckupPreview,
  updateCheckup,
  validateStandard,
  type HealthTechnician,
} from "../components/tpm/health-checkups/health-checkup-preview";

const technician = (): HealthTechnician => ({
  userId: "tech-user-1",
  name: "Preview technician",
  role: "EMPLOYEE",
  checkupDate: "2026-10-21",
});

const fixture = () => {
  const standard = sampleHealthCheckupPreview().standards[0];
  const asset = sampleAssets()[0];
  const checkup = createCheckupSnapshot(standard, asset, technician(), []);
  return { standard, asset, checkup };
};

function fillHealthyAnswers(checkup: ReturnType<typeof fixture>["checkup"]) {
  const answers = Object.fromEntries(
    checkup.items.map((item) => {
      let value = "Pass";
      if (item.responseType === "Number") {
        const min = item.min ? Number(item.min) : 0;
        const max = item.max ? Number(item.max) : min + 1;
        value = String((min + max) / 2);
      } else if (item.responseType === "Condition") value = "Good";
      return [item.id, { value, note: "", photo: "" }];
    }),
  );
  return answers;
}

test("sample standards are valid and motor checks cover temperature, vibration, noise, lubrication", () => {
  const data = sampleHealthCheckupPreview();
  assert.equal(healthCheckupPreviewSchema.safeParse(data).success, true);
  const motor = data.standards[0];
  assert.equal(motor.machineType, "Motor");
  assert.equal(motor.status, "Published");
  const titles = motor.items.map((item) => item.title.toLowerCase()).join(" ");
  assert.match(titles, /temperature/);
  assert.match(titles, /vibration/);
  assert.match(titles, /noise/);
  assert.match(titles, /lubrication/);
  assert.equal(Object.keys(validateStandard(motor)).length, 0);
});

test("unpublished standards and retired assets cannot start a checkup", () => {
  const { standard, asset } = fixture();
  assert.throws(
    () =>
      createCheckupSnapshot(
        { ...standard, status: "Draft" },
        asset,
        technician(),
        [],
      ),
    /Publish/,
  );
  assert.throws(
    () =>
      createCheckupSnapshot(
        standard,
        { ...asset, usage: "Retired" },
        technician(),
        [],
      ),
    /registered asset/,
  );
});

test("missing checks evaluate as Incomplete, never Healthy", () => {
  const { checkup } = fixture();
  const partial = updateCheckup(
    checkup,
    {
      [checkup.items[0].id]: {
        value: "50",
        note: "",
        photo: "",
      },
    },
    "",
    false,
  );
  const report = evaluateHealthReport(partial);
  assert.equal(report.healthStatus, "Incomplete");
  assert.notEqual(report.healthStatus, "Healthy");
});

test("out-of-range readings become Needs Attention or Critical with problems listed", () => {
  const { checkup } = fixture();
  const answers = fillHealthyAnswers(checkup);
  const vibration = checkup.items.find((item) =>
    item.title.toLowerCase().includes("vibration"),
  );
  assert.ok(vibration);
  answers[vibration.id] = {
    value: "9.5",
    note: "High vibration at drive end",
    photo: "",
  };
  const saved = updateCheckup(checkup, answers, "", true);
  assert.equal(saved.healthStatus, "Critical");
  assert.equal(saved.status, "Pending verification");
  assert.ok(saved.problems.some((problem) => /vibration/i.test(problem)));
  assert.equal(healthItemHasIssue(vibration, answers[vibration.id]), true);
});

test("healthy completion scores 100 and does not stay Incomplete", () => {
  const { checkup } = fixture();
  const saved = updateCheckup(checkup, fillHealthyAnswers(checkup), "", true);
  assert.equal(saved.healthStatus, "Healthy");
  assert.equal(saved.score, 100);
  assert.equal(saved.status, "Completed");
  assert.deepEqual(saved.problems, []);
});

test("verification after repair can mark the original checkup Healthy", () => {
  const { standard, asset, checkup } = fixture();
  const problemAnswers = fillHealthyAnswers(checkup);
  const noise = checkup.items.find((item) =>
    item.title.toLowerCase().includes("noise"),
  );
  assert.ok(noise);
  problemAnswers[noise.id] = {
    value: "Poor",
    note: "Grinding noise",
    photo: "",
  };
  const original = updateCheckup(checkup, problemAnswers, "", true);
  assert.equal(original.healthStatus, "Needs Attention");
  assert.equal(original.status, "Pending verification");

  const verification = createCheckupSnapshot(
    standard,
    asset,
    technician(),
    [original],
    { verifiesCheckupId: original.id },
  );
  const completedVerification = updateCheckup(
    verification,
    fillHealthyAnswers(verification),
    "Repaired and rechecked",
    true,
  );
  assert.equal(completedVerification.healthStatus, "Healthy");
  const verified = markCheckupVerified(original, completedVerification);
  assert.equal(verified.healthStatus, "Healthy");
  assert.equal(verified.status, "Completed");
  assert.ok(verified.verifiedAt);
});

test("work orders can be linked and previous checkups are ordered newest first", () => {
  const { standard, asset, checkup } = fixture();
  const first = updateCheckup(checkup, fillHealthyAnswers(checkup), "", true);
  const second = createCheckupSnapshot(standard, asset, technician(), [first]);
  const completedSecond = updateCheckup(
    second,
    fillHealthyAnswers(second),
    "",
    true,
  );
  const linked = linkWorkOrderToCheckup(first, "wo-demo-1");
  assert.deepEqual(linked.workOrderIds, ["wo-demo-1"]);
  const previous = previousCheckupsForAsset(
    [first, completedSecond],
    asset.id,
    standard.id,
  );
  assert.equal(previous[0].id, completedSecond.id);
  assert.equal(previous[1].id, first.id);
});

test("date helpers reject invalid calendars and support org time zones", () => {
  assert.equal(isValidHealthDate("2026-02-30"), false);
  assert.equal(isValidHealthDate("2024-02-29"), true);
  assert.match(healthToday("Asia/Kolkata"), /^\d{4}-\d{2}-\d{2}$/);
});
