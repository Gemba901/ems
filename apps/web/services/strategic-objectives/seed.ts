import {
  approvedVersion,
  emptyGoal,
  emptyObjective,
  generateCode,
  newDraft,
  revision,
} from "./rules";
import { planningPeriods } from "./stubs/planning-periods";
import type {
  GoalData,
  GoalRecord,
  MockState,
  ObjectiveData,
  ObjectiveRecord,
  PillarCode,
} from "./types";

// Synthetic company plan, recreated once per mounted demo session. Never imported into EMS.
export function createSeedState(): MockState {
  const created = "2026-01-02T09:00:00.000Z";
  const approved = "2026-01-03T09:00:00.000Z";
  const changed = "2026-10-29T09:00:00.000Z";
  const leader = "demo-emp-01";
  const approver = "demo-emp-02";
  const objectives: ObjectiveRecord[] = [];
  const goals: GoalRecord[] = [];
  function addObjective(
    id: string,
    pillar: PillarCode,
    data: Partial<ObjectiveData>,
    published: boolean,
  ) {
    const draft = newDraft(
      {
        ...emptyObjective(),
        primaryPillarCode: pillar,
        planningPeriodId: planningPeriods[0].id,
        ...data,
      },
      leader,
      created,
    );
    const record: ObjectiveRecord = {
      id,
      code: generateCode(
        "OBJ",
        objectives.map((item) => item.code),
        published ? pillar : null,
        published ? planningPeriods[0] : null,
      ),
      versions: [
        published ? approvedVersion(draft, approver, approved) : draft,
      ],
      audit: [{ action: "Created", actorId: leader, at: created, version: 1 }],
    };
    if (published)
      record.audit.push({
        action: "Approved",
        actorId: approver,
        at: approved,
        version: 1,
      });
    objectives.push(record);
    return record;
  }
  function addGoal(
    id: string,
    objective: ObjectiveRecord,
    data: Partial<GoalData>,
    published: boolean,
  ) {
    const draft = newDraft(
      {
        ...emptyGoal(),
        ...data,
        smartConfirmations: {
          specific: published,
          achievable: published,
          relevant: published,
        },
      },
      leader,
      created,
    );
    const record: GoalRecord = {
      id,
      objectiveId: objective.id,
      code: generateCode(
        "GOAL",
        goals.map((item) => item.code),
        published ? objective.versions[0].data.primaryPillarCode : null,
        published ? planningPeriods[0] : null,
      ),
      versions: [
        published ? approvedVersion(draft, approver, approved) : draft,
      ],
      audit: [{ action: "Created", actorId: leader, at: created, version: 1 }],
    };
    if (published)
      record.audit.push({
        action: "Approved",
        actorId: approver,
        at: approved,
        version: 1,
      });
    goals.push(record);
    return record;
  }
  const leadership = addObjective(
    "demo-obj-lex",
    "LEX",
    {
      title: "Give every department a shared direction",
      meaning:
        "Make company priorities clear so departments can plan distinct contributions to the same outcomes.",
      ownerId: leader,
      alignments: ["Delivery", "Morale"],
    },
    false,
  );
  addGoal(
    "demo-goal-alignment",
    leadership,
    {
      resultStatement:
        "Have every department acknowledge the agreed company priorities.",
      measure:
        "Departments that have acknowledged the plan / total departments × 100",
      target: 100,
      unit: "% of departments",
      ownerId: leader,
      deadline: "2026-12-15",
      contributingDepartmentIds: [
        "demo-dept-production",
        "demo-dept-people",
        "demo-dept-finance",
      ],
    },
    false,
  );
  addGoal(
    "demo-goal-review",
    leadership,
    {
      resultStatement: "Establish a consistent leadership review rhythm.",
      measure: "Completed company performance reviews",
      unit: "reviews",
      contributingDepartmentIds: ["demo-dept-leadership"],
      // Deliberately incomplete: missing target, owner and deadline are not zero.
    },
    false,
  );
  const operations = addObjective(
    "demo-obj-opx",
    "OPX",
    {
      title: "Make production reliable and right first time",
      meaning:
        "Deliver dependable output while reducing avoidable quality losses and dispatch delays.",
      ownerId: "demo-emp-03",
      alignments: ["Quality", "Cost", "Delivery"],
    },
    true,
  );
  addGoal(
    "demo-goal-scrap",
    operations,
    {
      resultStatement:
        "Reduce the company production scrap rate to 2% by year end.",
      measure: "Verified scrap weight / total production weight × 100",
      baseline: 5,
      target: 2,
      unit: "%",
      ownerId: "demo-emp-05",
      deadline: "2026-12-31",
      contributingDepartmentIds: [
        "demo-dept-production",
        "demo-dept-quality",
        "demo-dept-maintenance",
      ],
    },
    true,
  );
  addGoal(
    "demo-goal-dispatch",
    operations,
    {
      resultStatement: "Achieve 97% on-time customer dispatches by year end.",
      measure: "Verified on-time dispatches / total dispatches × 100",
      baseline: 89,
      target: 97,
      unit: "%",
      ownerId: "demo-emp-09",
      deadline: "2026-12-31",
      contributingDepartmentIds: [
        "demo-dept-production",
        "demo-dept-supply",
        "demo-dept-sales",
      ],
    },
    true,
  );
  const finance = addObjective(
    "demo-obj-fpex",
    "FPEX",
    {
      title: "Strengthen cash resilience",
      meaning:
        "Improve collection discipline while maintaining reliable supplier and customer relationships.",
      ownerId: "demo-emp-11",
      alignments: ["Cost", "Delivery"],
    },
    true,
  );
  const collections = addGoal(
    "demo-goal-collections",
    finance,
    {
      resultStatement:
        "Reduce company days sales outstanding to 50 days by year end.",
      measure:
        "Verified receivables / credit sales × days in the reporting period",
      baseline: 62,
      target: 50,
      unit: "days",
      ownerId: "demo-emp-11",
      deadline: "2026-12-31",
      contributingDepartmentIds: ["demo-dept-finance", "demo-dept-sales"],
    },
    true,
  );
  const objectiveRevision = revision(
    finance,
    "Review collection priorities following updated customer payment terms.",
    "2026-11-01",
    leader,
    changed,
  );
  objectiveRevision.data.meaning =
    "Shorten cash collection cycles through coordinated finance and customer follow-up, while preserving customer relationships.";
  finance.versions.push(objectiveRevision);
  finance.audit.push({
    action: "Revision started",
    actorId: leader,
    at: changed,
    version: 2,
  });
  const goalRevision = revision(
    collections,
    "Propose a stronger collection target after reviewing payment terms.",
    "2026-11-01",
    leader,
    changed,
  );
  goalRevision.data.target = 45;
  goalRevision.data.resultStatement =
    "Reduce company days sales outstanding to 45 days by year end.";
  goalRevision.data.smartConfirmations = {
    specific: false,
    achievable: false,
    relevant: false,
  };
  collections.versions.push(goalRevision);
  collections.audit.push({
    action: "Revision started",
    actorId: leader,
    at: changed,
    version: 2,
  });
  return { objectives, goals };
}
