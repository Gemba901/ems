import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewLibraryRefresh,
  sameLibraryIdentity,
} from "../services/leadership-excellence/performance-intelligence/library-conflicts";
import type {
  LibraryEntry,
  LibraryView,
} from "../services/leadership-excellence/performance-intelligence/library";

function entry(): LibraryEntry {
  return {
    definition: {
      id: "definition-1",
      code: "KPI-1",
      kraId: "kra-1",
      name: "Delivery time",
      meaning: "Time to deliver",
      unit: "hours",
      direction: "LOWER",
      formula: "DIRECT",
      inputA: "Hours",
      inputB: "",
      aggregation: "CLOSING",
      source: "CUSTOM",
      dataSource: "Delivery register",
    },
    status: "DRAFT",
    approverId: "approver-1",
    revisionReason: "",
    effectiveDate: "2027-01-01",
    versions: [],
    history: [],
    permissions: {
      canEdit: true,
      canSubmit: true,
      canApprove: false,
      canReturn: false,
      canRevise: false,
      canAdapt: true,
    },
  };
}
function view(entries: LibraryEntry[]): LibraryView {
  return {
    revision: 8,
    today: "2027-01-01",
    canEdit: true,
    canApprove: true,
    approvers: [{ id: "approver-1", name: "Approver" }],
    kras: [{ id: "kra-1", code: "KRA-1", name: "Delivery" }],
    entries,
  };
}

test("an unrelated workspace change allows the held draft to use the refreshed revision", () => {
  const original = entry();
  const current = structuredClone(original);
  current.history.push({
    id: "audit",
    action: "READ",
    actorId: "u",
    actorName: "User",
    actorRole: "MANAGEMENT",
    at: "2027-01-01T00:00:00Z",
    detail: "No content change",
  });
  current.definition = Object.fromEntries(
    Object.entries(current.definition).reverse(),
  ) as LibraryEntry["definition"];
  const result = reviewLibraryRefresh(original, view([current]), "SAVE_DRAFT");
  assert.equal(result.allowed, true);
  assert.equal(result.changed, false);
  assert.equal(result.requiresConfirmation, false);
});

test("changed units or sources require explicit review before held values overwrite the draft", () => {
  const original = entry();
  const current = structuredClone(original);
  current.definition.unit = "minutes";
  current.definition.dataSource = "New delivery register";
  const result = reviewLibraryRefresh(original, view([current]), "SAVE_DRAFT");
  assert.equal(result.allowed, true);
  assert.equal(result.changed, true);
  assert.equal(result.requiresConfirmation, true);
  assert.equal(result.entry?.definition.unit, "minutes");
  assert.equal(original.definition.unit, "hours");
});

test("a draft submitted by another editor can no longer be overwritten after refresh", () => {
  const original = entry();
  const current = structuredClone(original);
  current.status = "IN_REVIEW";
  current.permissions.canEdit = false;
  current.permissions.canSubmit = false;
  const result = reviewLibraryRefresh(original, view([current]), "SAVE_DRAFT");
  assert.equal(result.allowed, false);
  assert.equal(result.changed, true);
});

test("every refreshed approval requires a fresh confirmation even when content is unchanged", () => {
  const original = entry();
  original.status = "IN_REVIEW";
  original.permissions.canApprove = true;
  const result = reviewLibraryRefresh(
    original,
    view([structuredClone(original)]),
    "APPROVE",
  );
  assert.equal(result.allowed, true);
  assert.equal(result.changed, false);
  assert.equal(result.requiresConfirmation, true);
});

test("reassigned or removed definitions cannot be approved using a refreshed revision", () => {
  const original = entry();
  original.status = "IN_REVIEW";
  original.permissions.canApprove = true;
  const current = structuredClone(original);
  current.approverId = "someone-else";
  current.permissions.canApprove = false;
  assert.equal(
    reviewLibraryRefresh(original, view([current]), "APPROVE").allowed,
    false,
  );
  const missing = reviewLibraryRefresh(original, view([]), "APPROVE");
  assert.equal(missing.allowed, false);
  assert.equal(missing.entry, undefined);
});

test("new drafts and adaptations recheck current permission and the source definition", () => {
  const original = entry();
  const latest = view([original]);
  assert.equal(
    reviewLibraryRefresh(undefined, latest, "SAVE_DRAFT").allowed,
    true,
  );
  latest.canEdit = false;
  assert.equal(
    reviewLibraryRefresh(undefined, latest, "SAVE_DRAFT").allowed,
    false,
  );
  assert.equal(reviewLibraryRefresh(original, latest, "ADAPT").allowed, false);
  assert.equal(
    reviewLibraryRefresh(original, view([]), "ADAPT").allowed,
    false,
  );
});

test("changed approval dates and approvers require review even when the measurement is unchanged", () => {
  const original = entry();
  const current = structuredClone(original);
  current.effectiveDate = "2027-03-01";
  current.approverId = "other-approver";
  const result = reviewLibraryRefresh(original, view([current]), "SUBMIT");
  assert.equal(result.changed, true);
  assert.equal(result.requiresConfirmation, true);
});

test("identity guards reject tenant, user and permission changes while allowing the same actor", () => {
  const original = {
    organizationId: "org-1",
    userId: "user-1",
    roleLevel: "MANAGEMENT",
    roleId: 2,
  };
  assert.equal(sameLibraryIdentity(original, { ...original }), true);
  for (const current of [
    null,
    { ...original, organizationId: "org-2" },
    { ...original, userId: "user-2" },
    { ...original, roleLevel: "EMPLOYEE" },
    { ...original, roleId: 3 },
  ])
    assert.equal(sameLibraryIdentity(original, current), false);
  assert.equal(sameLibraryIdentity(null, original), false);
});
