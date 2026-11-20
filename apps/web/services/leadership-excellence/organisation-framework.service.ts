import { apiClient } from "@/lib/api-client";
import type { OrganogramViewData } from "@/components/leadership-excellence/organisation-framework/organogram/types";
import type { PositionChart } from "@/components/leadership-excellence/organisation-framework/positions/types";

// Area 02 · Organisation Framework: calls to /leadership-excellence/organisation-framework/*.
const BASE = "/api/leadership-excellence/organisation-framework";

async function read<T>(
  path: string,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiClient(`${BASE}${path}`, { signal }, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      Array.isArray(value.message)
        ? value.message.join(" ")
        : value.message || "Unable to load the organisation framework",
    );
  return value as T;
}

// ---- 02.01 · EMS organisation data & organogram ----
/** The company's structure: units, leads, people counts and source checks. */
export const getOrganogram = (token: string, signal?: AbortSignal) =>
  read<OrganogramViewData>("/organogram", token, signal);

// ---- 02.02 · Positions, roles & reporting relationships ----
/** Positions, who holds each one, and which position each reports to. */
export const getPositionChart = (token: string, signal?: AbortSignal) =>
  read<PositionChart>("/positions", token, signal);
