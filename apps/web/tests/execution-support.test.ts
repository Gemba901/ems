import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExecutionAction,
  ExecutionGoal,
  ExecutionSupportRequest,
  ExecutionView,
} from "../services/leadership-excellence/execution/types";
import type {
  PlanningActor,
  PlanningPerson,
} from "../services/leadership-excellence/performance-planning/types";
import {
  groupSupportRequests,
  isSupportActor,
  supportAcceptanceElapsed,
  supportAcknowledgementState,
  supportPerson,
  supportRequestsInScope,
  supportSummary,
} from "../services/leadership-excellence/execution/support";

const actor: PlanningActor = {
  employeeId: "employee-sender",
  userId: "user-sender",
  name: "Sender",
  departmentId: "operations",
  role: "MANAGER",
};
const people: PlanningPerson[] = [
  {
    id: "employee-sender",
    userId: "user-sender",
    name: "Sender",
    departmentId: "operations",
    position: "Operations manager",
    role: "MANAGER",
  },
  {
    id: "employee-recipient",
    userId: "user-recipient",
    name: "Recipient",
    departmentId: "support",
    position: "Support lead",
    role: "EMPLOYEE",
  },
];

function request(
  id: string,
  overrides: Partial<ExecutionSupportRequest> = {},
): ExecutionSupportRequest {
  return {
    id,
    goalKey: "plan/goal/v1",
    actionKey: null,
    title: "Help with the delivery",
    request: "Please arrange the required resource.",
    requestorId: actor.employeeId,
    assignedToId: "employee-recipient",
    dueDate: "2027-01-05",
    status: "OPEN",
    response: "",
    createdAt: "2027-01-01T10:00:00.000Z",
    history: [],
    ...overrides,
  };
}

const acknowledgement = {
  at: "2027-01-01T10:01:30.000Z",
  by: "user-recipient",
  name: "Recipient",
};

test("support identities resolve employee and user references, including administrators without an employee ID", () => {
  assert.equal(supportPerson("employee-sender", people)?.name, "Sender");
  assert.equal(supportPerson("user-sender", people)?.name, "Sender");
  assert.equal(supportPerson("unknown", people), undefined);
  assert.equal(isSupportActor("employee-sender", actor, people), true);
  assert.equal(isSupportActor("user-sender", actor, people), true);
  const administrator = { ...actor, employeeId: "" };
  assert.equal(isSupportActor("user-sender", administrator, []), true);
  assert.equal(isSupportActor("employee-sender", administrator, people), true);
  assert.equal(isSupportActor("employee-recipient", administrator, people), false);
  assert.equal(isSupportActor("", administrator, people), false);
});

test("acknowledgement is independent of progress and legacy completion never implies acceptance", () => {
  for (const status of ["OPEN", "IN_PROGRESS"] as const) {
    assert.equal(supportAcknowledgementState(request(status, { status })), "PENDING");
    assert.equal(
      supportAcknowledgementState(request(status, { status, acknowledgement: null })),
      "PENDING",
    );
  }
  for (const status of ["RESOLVED", "CLOSED"] as const) {
    assert.equal(
      supportAcknowledgementState(request(status, { status, response: "Already handled" })),
      "NOT_RECORDED",
    );
  }
  for (const status of ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const) {
    assert.equal(
      supportAcknowledgementState(request(status, { status, acknowledgement })),
      "ACCEPTED",
    );
  }
});

test("acceptance timing uses the recorded timestamps and readable duration units", () => {
  const cases: Array<[number, string]> = [
    [0, "0 seconds"],
    [999, "0 seconds"],
    [1000, "1 second"],
    [45_000, "45 seconds"],
    [60_000, "1 minute"],
    [90_000, "1 minute 30 seconds"],
    [3_720_000, "1 hour 2 minutes"],
    [183_600_000, "2 days 3 hours"],
    [183_905_000, "2 days 3 hours"],
    [86_405_000, "1 day 5 seconds"],
  ];
  for (const [milliseconds, expected] of cases) {
    const entry = request(String(milliseconds), {
      acknowledgement: {
        ...acknowledgement,
        at: new Date(Date.parse("2027-01-01T10:00:00.000Z") + milliseconds).toISOString(),
      },
    });
    assert.equal(supportAcceptanceElapsed(entry), expected);
  }
  assert.equal(
    supportAcceptanceElapsed(request("offset", {
      acknowledgement: { ...acknowledgement, at: "2027-01-01T15:31:30+05:30" },
    })),
    "1 minute 30 seconds",
  );
});

test("missing, invalid, or reversed timing never fabricates an acceptance delay", () => {
  assert.equal(supportAcceptanceElapsed(request("missing")), null);
  assert.equal(supportAcceptanceElapsed(request("null", { acknowledgement: null })), null);
  assert.equal(
    supportAcceptanceElapsed(request("bad-start", { createdAt: "invalid", acknowledgement })),
    null,
  );
  assert.equal(
    supportAcceptanceElapsed(request("bad-end", {
      acknowledgement: { ...acknowledgement, at: "invalid" },
    })),
    null,
  );
  assert.equal(
    supportAcceptanceElapsed(request("reversed", {
      acknowledgement: { ...acknowledgement, at: "2026-12-31T10:00:00.000Z" },
    })),
    null,
  );
});

test("summary counts sender and recipient aliases, self requests, and unrecorded legacy acceptance separately", () => {
  const entries = [
    request("sent-pending"),
    request("sent-accepted", { requestorId: actor.userId, acknowledgement }),
    request("received-pending", {
      requestorId: "employee-recipient",
      assignedToId: actor.userId,
      status: "IN_PROGRESS",
    }),
    request("self-accepted", {
      assignedToId: actor.employeeId,
      status: "CLOSED",
      acknowledgement,
    }),
    request("received-legacy", {
      requestorId: "employee-recipient",
      assignedToId: actor.employeeId,
      status: "CLOSED",
    }),
    request("other-legacy", { requestorId: "other", status: "RESOLVED" }),
  ];
  assert.deepEqual(supportSummary(entries, actor, people), {
    sent: 3,
    received: 3,
    pending: 2,
    accepted: 2,
    notRecorded: 2,
  });
  assert.deepEqual(supportSummary([], actor, people), {
    sent: 0,
    received: 0,
    pending: 0,
    accepted: 0,
    notRecorded: 0,
  });
});

test("sender-to-recipient groups combine user and employee aliases without merging the reverse direction", () => {
  const groups = groupSupportRequests([
    request("pending"),
    request("accepted", {
      requestorId: "user-sender",
      assignedToId: "user-recipient",
      acknowledgement,
    }),
    request("legacy", { status: "RESOLVED" }),
    request("reverse", {
      requestorId: "employee-recipient",
      assignedToId: "user-sender",
    }),
    request("unknown", { requestorId: "unknown-sender" }),
  ], people);
  assert.equal(groups.length, 3);
  const sent = groups.find((group) => group.requestorId === "employee-sender");
  assert.ok(sent);
  assert.equal(sent.assignedToId, "employee-recipient");
  assert.equal(sent.sent, 3);
  assert.equal(sent.accepted, 1);
  assert.equal(sent.pending, 1);
  assert.equal(sent.notRecorded, 1);
  const reverse = groups.find((group) => group.requestorId === "employee-recipient");
  assert.equal(reverse?.assignedToId, "employee-sender");
  assert.equal(reverse?.sent, 1);
  assert.equal(groups.find((group) => group.requestorId === "unknown-sender")?.sent, 1);
  assert.equal(new Set(groups.map((group) => group.key)).size, groups.length);
});

test("personal support includes incoming projections and user-ID senders only in the selected cycle", () => {
  const data: ExecutionView = {
    schema: 1,
    revision: 1,
    planningRevision: 1,
    today: "2027-01-01",
    actor: { ...actor, employeeId: "" },
    canViewDepartment: true,
    references: { people, departments: [] },
    results: [],
    actionUpdates: [],
    goals: [],
    assignments: [],
    actions: [],
    supportRequests: [
      request("incoming", {
        cycle: "2027",
        goalTitle: "Confidential work summary",
        requestorId: "employee-recipient",
        assignedToId: actor.employeeId,
      }),
      request("outgoing", { cycle: "2027", requestorId: actor.userId }),
      request("another-cycle", { cycle: "2026", requestorId: actor.userId }),
      request("unrelated", {
        cycle: "2027",
        requestorId: "other",
        assignedToId: "employee-recipient",
      }),
    ],
  };
  const selection = {
    scope: "personal" as const,
    cycle: "2027",
    department: "",
    goals: [],
    actions: [],
  };
  assert.deepEqual(
    supportRequestsInScope(data, selection).map((entry) => entry.id).sort(),
    ["incoming", "outgoing"],
  );
  assert.deepEqual(
    supportRequestsInScope(data, { ...selection, scope: "department" })
      .map((entry) => entry.id).sort(),
    ["incoming", "outgoing"],
  );
  assert.deepEqual(
    supportRequestsInScope(data, { ...selection, scope: "department", department: "operations" }),
    [],
  );
});

test("scope links support across goal revisions while respecting selected departments and cycles", () => {
  const goal = {
    key: "plan/goal/v2",
    cycle: "2027",
    departmentId: "operations",
  } as ExecutionGoal;
  const otherGoal = {
    key: "other-plan/goal/v1",
    cycle: "2027",
    departmentId: "support",
  } as ExecutionGoal;
  const action = {
    key: "plan/action/v1",
    cycle: "2027",
    departmentId: "operations",
  } as ExecutionAction;
  const data: ExecutionView = {
    schema: 1, revision: 0, planningRevision: 0, today: "2027-01-01",
    canViewDepartment: true, results: [], actionUpdates: [], assignments: [],
    actor,
    references: { people, departments: [] },
    goals: [goal, otherGoal],
    actions: [action],
    supportRequests: [
      request("earlier-goal-version", { requestorId: "other" }),
      request("action-link", {
        goalKey: "hidden-plan/goal/v1",
        actionKey: action.key,
        requestorId: "other",
      }),
      request("other-department", { goalKey: otherGoal.key, requestorId: "other" }),
      request("other-cycle", { cycle: "2026" }),
    ],
  };
  const selection = {
    scope: "department" as const,
    cycle: "2027",
    department: "operations",
    goals: [goal],
    actions: [action],
  };
  assert.deepEqual(
    supportRequestsInScope(data, selection).map((entry) => entry.id).sort(),
    ["action-link", "earlier-goal-version"],
  );
});
