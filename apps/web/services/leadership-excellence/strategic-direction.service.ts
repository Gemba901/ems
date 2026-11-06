import { apiClient } from "@/lib/api-client";

const API_URL = "/api/leadership-excellence/strategic-direction";

// ── Types (mirror the API in apps/api/src/leadership-excellence/strategic-direction) ──

export type DirectionStatus = "DRAFT" | "IN_REVIEW" | "APPROVED";
export type DirectionSection = "organisation" | "vision" | "mission" | "values";

export const TEXT_FIELDS = ["company", "business", "purpose", "vision", "visionWhy", "mission", "missionWhy"] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

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

/** GET / — the working draft (editors only). `id` is null until the first save. */
export interface StrategicDirectionDraft extends Record<TextField, string | null> {
  id: string | null;
  status: DirectionStatus;
  values: CoreValue[];
  sectionMeta: Partial<Record<DirectionSection, SectionStamp>>;
  returnReason: string | null;
  revisionReason: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  currentVersion: number | null;
  updatedAt?: string;
  /** The published version, still live while a revision is drafted. */
  approved: { version: number; approvedAt: string; approvedByName: string | null } | null;
}

/** GET /approved — what every employee may read. */
export interface ApprovedDirection extends Record<TextField, string> {
  version: number;
  values: CoreValue[];
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
  company: 150,
  business: 150,
  purpose: 500,
  vision: 250,
  visionWhy: 1000,
  mission: 350,
  missionWhy: 1000,
};

export const VALUE_LIMITS = { name: 50, why: 600, count: 10 } as const;

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
};
