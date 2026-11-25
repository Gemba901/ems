import { apiClient } from "@/lib/api-client";
import type { IntelligenceFilters, IntelligenceView } from "./types";

export type * from "./types";

const BASE = "/api/leadership-excellence/performance-intelligence";

export class IntelligenceApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function intelligenceQuery(filters: IntelligenceFilters): string {
  return new URLSearchParams(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  ).toString();
}

async function response(
  token: string,
  path: string,
  filters: IntelligenceFilters,
  signal?: AbortSignal,
): Promise<Response> {
  const result = await apiClient(
    `${BASE}/${path}?${intelligenceQuery(filters)}`,
    { signal },
    token,
  );
  if (!result.ok) {
    const error = await result.json().catch(() => ({}));
    const message = Array.isArray(error.message)
      ? error.message.join("\n")
      : error.message;
    throw new IntelligenceApiError(
      result.status,
      typeof message === "string"
        ? message
        : "Performance intelligence could not be loaded. Please try again.",
    );
  }
  return result;
}

export const IntelligenceReportingService = {
  async getView(
    token: string,
    mode: "dashboard" | "reports",
    filters: IntelligenceFilters,
    signal?: AbortSignal,
  ): Promise<IntelligenceView> {
    return (await response(token, mode, filters, signal)).json();
  },
  async exportCsv(
    token: string,
    filters: IntelligenceFilters,
    signal?: AbortSignal,
  ): Promise<Blob> {
    return (
      await response(token, "reports/export.csv", filters, signal)
    ).blob();
  },
};
