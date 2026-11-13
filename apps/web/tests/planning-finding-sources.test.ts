import test from "node:test";
import assert from "node:assert/strict";
import {
  findingReviewStatus,
  objectiveHasReviewedSource,
  resolvedObjectiveSources,
  reviewedSwotSources,
  sourceKey,
} from "../components/leadership-excellence/performance-planning/PlanningSources";
import type {
  Finding,
  Objective,
  PlanningDocument,
  PlanningView,
} from "../services/leadership-excellence/performance-planning/types";

const stamp = {
  createdAt: "2027-01-02",
  createdBy: "author",
  updatedAt: "2027-01-02",
  updatedBy: "author",
};
function finding(fields: Partial<Finding> = {}): Finding {
  return {
    ...stamp,
    id: "finding-1",
    code: "SWOT-OPX-2027-001",
    pillar: "OPX",
    category: "W",
    title: "Machine changeovers delay dispatch",
    relatedPillars: [],
    explanation: "Twelve delayed shifts",
    impact: "Orders leave after the agreed time",
    evidence: "January changeover register",
    sourceUrl: "",
    basis: "EVIDENCED",
    weightage: 8,
    priority: "HIGH",
    response: "OBJECTIVE",
    decisionNote: "Plan the changeover improvement",
    followupOwnerId: "leader",
    reviewDate: "2027-02-01",
    reviewStatus: "REVIEWED",
    ...fields,
  };
}
function plan(fields: Partial<PlanningDocument> = {}): PlanningDocument {
  return {
    id: "swot-2027",
    code: "SWOT-2027",
    kind: "SWOT",
    scopeId: "company",
    departmentId: "",
    cycle: "2027",
    status: "DRAFT",
    versions: [],
    history: [],
    effectiveDate: "",
    revisionReason: "",
    acknowledgement: null,
    data: {
      title: "2027 assessment",
      ownerId: "leader",
      approverId: "reviewer",
      coordinatorIds: [],
      contributorIds: [],
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      consideredPillars: [],
      findings: [],
      objectives: [],
      goals: [],
      assignments: [],
      actions: [],
    },
    ...fields,
  };
}
function review(f: Finding, version = 11) {
  return {
    finding: structuredClone(f),
    version,
    reviewedAt: "2027-01-03",
    reviewedBy: "reviewer",
  };
}
function objective(sources: Objective["sources"]): Objective {
  return {
    ...stamp,
    id: "objective-1",
    code: "OBJ-OPX-2027-001",
    title: "Improve delivery reliability",
    meaning: "Deliver as promised",
    pillar: "OPX",
    alignments: ["D"],
    alignmentReason: "",
    ownerId: "leader",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    sources,
    sourceRationale: "",
  };
}
function withPermissions(
  record: PlanningDocument,
  canSeeSources = true,
): PlanningView["documents"][number] {
  return {
    ...record,
    permissions: {
      canRead: true,
      canEdit: true,
      canApprove: false,
      canConfigure: false,
      canSeeSources,
    },
    issues: [],
  };
}

test("an individually reviewed finding is selectable before its whole SWOT document is approved", () => {
  const document = plan({ findingReviews: [review(finding())] });
  assert.equal(document.status, "DRAFT");
  assert.equal(document.versions.length, 0);
  const sources = reviewedSwotSources([document], "2027");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].finding.title, "Machine changeovers delay dispatch");
  assert.equal(sources[0].version, 11);
});

test("pending or evidence-incomplete per-finding snapshots cannot become approved sources", () => {
  const document = plan({
    findingReviews: [
      review(finding({ id: "pending", reviewStatus: "UNDER_REVIEW" })),
      review(finding({ id: "evidence", reviewStatus: "NEEDS_EVIDENCE" })),
      review(
        finding({
          id: "inconsistent",
          reviewStatus: "REVIEWED",
          basis: "NEEDS_CHECKING",
        }),
      ),
      review(
        finding({
          id: "ready",
          reviewStatus: "REVIEWED",
          response: "MAINTAIN",
        }),
      ),
    ],
  });
  assert.deepEqual(
    reviewedSwotSources([document], "2027").map((source) => source.findingId),
    ["ready"],
  );
});

test("legacy approved assessment sources stay available and duplicate identities resolve to the immutable per-item snapshot", () => {
  const document = plan({
    findingReviews: [
      review(finding({ title: "Individually reviewed title" }), 1),
    ],
  });
  document.versions = [
    {
      version: 1,
      data: {
        ...document.data,
        findings: [
          finding({ title: "Full assessment title" }),
          finding({ id: "legacy", reviewStatus: undefined }),
          finding({ id: "pending", reviewStatus: "UNDER_REVIEW" }),
        ],
      },
      approvedAt: "2027-01-03",
      approvedBy: "reviewer",
      effectiveDate: "2027-01-03",
      definitions: [],
      reason: "",
    },
  ];
  const sources = reviewedSwotSources([document], "2027");
  assert.equal(sources.length, 2);
  assert.equal(new Set(sources.map(sourceKey)).size, 2);
  assert.equal(
    sources.find((source) => source.findingId === "finding-1")?.finding.title,
    "Individually reviewed title",
  );
  assert(sources.some((source) => source.findingId === "legacy"));
});

test("reopening the live finding never changes the source version pinned to an objective", () => {
  const original = finding();
  const document = plan({ findingReviews: [review(original, 11)] });
  document.data.findings = [
    finding({ title: "New unreviewed evidence", reviewStatus: "UNDER_REVIEW" }),
  ];
  document.findingReviews!.push(
    review(finding({ title: "Second approved review" }), 14),
  );
  const old = resolvedObjectiveSources(
    [{ documentId: document.id, findingId: original.id, version: 11 }],
    "2027",
    [document],
  );
  assert.equal(old.length, 1);
  assert.equal(old[0].finding.title, original.title);
  const updated = resolvedObjectiveSources(
    [{ documentId: document.id, findingId: original.id, version: 14 }],
    "2027",
    [document],
  );
  assert.equal(updated[0].finding.title, "Second approved review");
  assert.equal(
    resolvedObjectiveSources(
      [{ documentId: document.id, findingId: original.id, version: 12 }],
      "2027",
      [document],
    ).length,
    0,
  );
});

test("source choices are isolated to the same planning year and SWOT documents", () => {
  const document = plan({ findingReviews: [review(finding())] });
  const wrongYear = plan({
    id: "swot-2026",
    cycle: "2026",
    findingReviews: [review(finding())],
  });
  const wrongKind = plan({
    id: "company-2027",
    kind: "COMPANY",
    findingReviews: [review(finding())],
  });
  assert.deepEqual(
    reviewedSwotSources([document, wrongYear, wrongKind], "2027").map(
      (source) => source.documentId,
    ),
    [document.id],
  );
});

test("objective eligibility requires every referenced source; it never substitutes another review version", () => {
  const assessment = plan({ findingReviews: [review(finding(), 11)] });
  const company = plan({ id: "company", kind: "COMPANY" });
  const source = {
    documentId: assessment.id,
    findingId: "finding-1",
    version: 11,
  };
  const documents = [withPermissions(assessment), withPermissions(company)];
  assert(objectiveHasReviewedSource(objective([source]), company, documents));
  assert(
    !objectiveHasReviewedSource(
      objective([{ ...source, version: 12 }]),
      company,
      documents,
    ),
  );
  assert(
    !objectiveHasReviewedSource(
      objective([source, { ...source, findingId: "missing" }]),
      company,
      documents,
    ),
  );
  assert(!objectiveHasReviewedSource(objective([]), company, documents));
});

test("confidential source redaction retains only the already-approved objective eligibility", () => {
  const item = objective([]);
  const company = plan({ id: "company", kind: "COMPANY" });
  company.versions = [
    {
      version: 1,
      data: { ...company.data, objectives: [item] },
      approvedAt: "2027-01-03",
      approvedBy: "reviewer",
      effectiveDate: "2027-01-03",
      definitions: [],
      reason: "",
    },
  ];
  assert(
    objectiveHasReviewedSource(item, company, [
      withPermissions(company, false),
    ]),
  );
  assert(
    !objectiveHasReviewedSource({ ...item, id: "unapproved" }, company, [
      withPermissions(company, false),
    ]),
  );
});

test("review status honors explicit per-item state and safely handles legacy assessments", () => {
  const approved = plan({ status: "APPROVED" });
  assert.equal(
    findingReviewStatus(finding({ reviewStatus: "UNDER_REVIEW" }), approved),
    "UNDER_REVIEW",
  );
  assert.equal(
    findingReviewStatus(finding({ reviewStatus: undefined }), approved),
    "REVIEWED",
  );
  assert.equal(
    findingReviewStatus(
      finding({ reviewStatus: undefined, basis: "NEEDS_CHECKING" }),
      approved,
    ),
    "NEEDS_EVIDENCE",
  );
  assert.equal(
    findingReviewStatus(finding({ reviewStatus: undefined }), plan()),
    "UNDER_REVIEW",
  );
});
