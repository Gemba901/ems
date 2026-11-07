import { apiClient } from "@/lib/api-client";
import type {
  PlanningCommand,
  PlanningView,
  TargetPeriod,
  Frequency,
} from "./performance-planning/types";
export type * from "./performance-planning/types";

const BASE = "/api/leadership-excellence/performance-planning";
export interface EvidenceFile {
  id: string;
  name: string;
  size: number;
  createdAt: string;
}
export class PlanningApiError extends Error {
  constructor(
    public readonly issues: string[],
    public readonly status: number,
  ) {
    super(issues.join("\n"));
  }
}
async function request<T>(
  token: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiClient(
    `${BASE}${path}`,
    body === undefined
      ? { signal }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
    token,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const issues = Array.isArray(result.message)
      ? result.message
      : [
          typeof result.message === "string"
            ? result.message
            : "Could not complete the request. Please try again.",
        ];
    throw new PlanningApiError(issues, response.status);
  }
  return result as T;
}
export const PerformancePlanningService = {
  backup: (token: string) =>
    request<{ payload: string; signature: string }>(token, "/backup"),
  restore: async (token: string, revision: number, file: File) => {
    const body = new FormData();
    body.append("file", file);
    const response = await apiClient(
      `${BASE}/restore?revision=${revision}`,
      { method: "POST", body },
      token,
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.message === "string"
          ? result.message
          : "Could not restore backup.",
      );
    return result;
  },
  evidence: (token: string, documentId: string, findingId: string) =>
    request<EvidenceFile[]>(
      token,
      `/${documentId}/findings/${findingId}/evidence`,
    ),
  uploadEvidence: async (
    token: string,
    documentId: string,
    findingId: string,
    revision: number,
    file: File,
  ) => {
    const body = new FormData();
    body.append("file", file);
    const response = await apiClient(
      `${BASE}/${documentId}/findings/${findingId}/evidence?revision=${revision}`,
      { method: "POST", body },
      token,
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.message === "string"
          ? result.message
          : "Could not attach evidence.",
      );
    return result as EvidenceFile[];
  },
  downloadEvidence: async (
    token: string,
    documentId: string,
    findingId: string,
    file: EvidenceFile,
  ) => {
    const response = await apiClient(
      `${BASE}/${documentId}/findings/${findingId}/evidence/${file.id}`,
      {},
      token,
    );
    if (!response.ok) throw new Error("Evidence could not be downloaded.");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  periods: (
    token: string,
    start: string,
    end: string,
    frequency: Frequency,
    schedule?: {
      weekStart?: number;
      fortnightAnchor?: string;
      twiceMonthlySplit?: number;
      submissionDueDays?: number;
      documentId?: string;
      assignmentId?: string;
      useCurrentCalendar?: boolean;
    },
  ) =>
    request<TargetPeriod[]>(
      token,
      `/periods?${new URLSearchParams({
        start,
        end,
        frequency,
        ...Object.fromEntries(
          Object.entries(schedule || {})
            .filter(([, value]) => value !== undefined && value !== "")
            .map(([key, value]) => [key, String(value)]),
        ),
      })}`,
    ),
  getWorkspace: (token: string, signal?: AbortSignal) =>
    request<PlanningView>(token, "/workspace", undefined, signal),
  command: (token: string, command: PlanningCommand) =>
    request<PlanningView & { focusId: string }>(token, "/commands", command),
  getApproved: (token: string) => request<unknown[]>(token, "/approved"),
};
