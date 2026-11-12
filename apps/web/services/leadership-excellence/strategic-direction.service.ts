import { apiClient } from "@/lib/api-client";

const API_URL = "/api/leadership-excellence/strategic-direction";

// ── Types (mirror the API in apps/api/src/leadership-excellence/strategic-direction) ──

export type DirectionStatus = "DRAFT" | "IN_REVIEW" | "APPROVED";
export type DirectionSection = "organisation" | "vision" | "mission" | "values" | "pillars";

export const TEXT_FIELDS = ["company", "business", "purpose", "vision", "visionWhy", "mission", "missionWhy"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const PILLAR_CODES = ["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"] as const;
export type PillarCode = (typeof PILLAR_CODES)[number];
/** Whole-number percentage per pillar; the six must total 100 before review. */
export type PillarWeights = Record<PillarCode, number>;

export interface CoreValue {
  id: string;
  name: string;
  why: string;
}

export interface SectionStamp {
  at: string;
  byId: string | null;
  byName: string | null;
}

/** Someone chosen to approve the direction. */
export interface DirectionApprover {
  employeeId: string;
  name: string;
  jobTitle: string | null;
}

/** GET /: the working draft (editors only). `id` is null until the first save. */
export interface StrategicDirectionDraft extends Record<TextField, string | null> {
  id: string | null;
  status: DirectionStatus;
  values: CoreValue[];
  pillarWeights: PillarWeights;
  sectionMeta: Partial<Record<DirectionSection, SectionStamp>>;
  returnReason: string | null;
  revisionReason: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  currentVersion: number | null;
  updatedAt?: string;
  /** The published version, still live while a revision is drafted. */
  approved: {
    version: number;
    approvedAt: string;
    approvedByName: string | null;
  } | null;
  submittedById?: string | null;
  approvers: DirectionApprover[];
  /** canReview: a chosen approver who did not send this submission. */
  viewer: { isApprover: boolean; isSubmitter: boolean; canReview: boolean };
}

/** GET /approved: what every employee may read. */
export interface ApprovedDirection extends Record<TextField, string> {
  version: number;
  values: CoreValue[];
  pillarWeights: PillarWeights;
  approvedAt: string;
  approvedById: string | null;
  approvedByName: string | null;
}

export interface DirectionEvent {
  id: string;
  action: "DRAFT_SAVED" | "SUBMITTED" | "RETURNED" | "WITHDRAWN" | "APPROVED" | "REVISION_STARTED";
  changes: Record<string, { from: unknown; to: unknown }>;
  reason: string | null;
  version: number | null;
  actorName: string | null;
  createdAt: string;
}

export type SaveDraftPayload = Partial<Record<TextField, string>> & {
  values?: { id?: string; name: string; why: string }[];
  pillarWeights?: PillarWeights;
  /** The updatedAt this form was loaded from; the API refuses a save on an older copy. */
  expectedUpdatedAt?: string;
};

/** A missing item from submit/approve; `field` is the input id on the page. */
export interface DirectionProblem {
  field: string;
  label: string;
}

// ── Labels and limits (match the API DTO and the prototype) ──

export const FIELD_LABELS: Record<TextField, string> = {
  company: "Organisation name",
  business: "Nature of business",
  purpose: "Purpose",
  vision: "Vision statement",
  visionWhy: "Why this vision?",
  mission: "Mission statement",
  missionWhy: "Why this mission?",
};

export const FIELD_LIMITS: Record<TextField, number> = {
  company: 50,
  business: 150,
  purpose: 500,
  vision: 200,
  visionWhy: 500,
  mission: 200,
  missionWhy: 500,
};

export const VALUE_LIMITS = { name: 50, why: 250, count: 8 } as const;

/** Matches DEFAULT_PILLAR_WEIGHTS in the API contract. */
export const DEFAULT_PILLAR_WEIGHTS: PillarWeights = {
  LEX: 10,
  PEX: 20,
  OPX: 30,
  CMX: 20,
  SGEX: 10,
  FPEX: 10,
};
export const PILLAR_TOTAL = 100;
export const weightsTotal = (w: PillarWeights) => PILLAR_CODES.reduce((sum, code) => sum + (w[code] ?? 0), 0);

// ── Requests ──

export class StrategicDirectionApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public problems: DirectionProblem[] = [],
  ) {
    super(message);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const text = Array.isArray(body?.message) ? body.message.join(". ") : body?.message;
    throw new StrategicDirectionApiError(
      text || `Request failed with status ${res.status}`,
      res.status,
      Array.isArray(body?.problems) ? body.problems : [],
    );
  }
  // GET /approved answers 200 with an empty body before the first approval.
  const raw = await res.text();
  return (raw ? JSON.parse(raw) : null) as T;
}

function request<T>(path: string, token: string, method = "GET", body?: unknown): Promise<T> {
  return apiClient(
    `${API_URL}${path}`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    },
    token,
  ).then((res) => handleResponse<T>(res));
}

export const StrategicDirectionService = {
  getDraft: (token: string) => request<StrategicDirectionDraft>("", token),
  getApproved: (token: string) => request<ApprovedDirection | null>("/approved", token),
  getHistory: (token: string) => request<DirectionEvent[]>("/history", token),
  saveDraft: (token: string, payload: SaveDraftPayload) => request<unknown>("/draft", token, "PATCH", payload),
  submit: (token: string) => request<unknown>("/submit", token, "POST"),
  withdraw: (token: string) => request<unknown>("/withdraw", token, "POST"),
  returnForChanges: (token: string, reason: string) => request<unknown>("/return", token, "POST", { reason }),
  approve: (token: string) => request<unknown>("/approve", token, "POST"),
  startRevision: (token: string, reason: string) => request<unknown>("/revise", token, "POST", { reason }),
  getApproverCandidates: (token: string) => request<DirectionApprover[]>("/approvers/candidates", token),
  setApprovers: (token: string, employeeIds: string[]) =>
    request<DirectionApprover[]>("/approvers", token, "PUT", { employeeIds }),
};
