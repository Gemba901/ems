import { apiClient } from "@/lib/api-client";
import type { PersonDetails } from "@/components/leadership-excellence/organisation-framework/positions/types";

// 02.02 · Positions: calls beyond the chart itself. Kept out of the shared Area 02 service file so updates to 02.02
// never need to change a file 02.01 and 02.03 also edit.
const BASE = "/api/leadership-excellence/organisation-framework/positions";

/** One person's details, limited by the API to what the signed-in viewer may see. */
export async function getPersonDetails(token: string, employeeId: string, signal?: AbortSignal): Promise<PersonDetails> {
  const response = await apiClient(`${BASE}/people/${encodeURIComponent(employeeId)}`, { signal }, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(value.message) ? value.message.join(" ") : value.message || "Unable to load this person's details");
  return value as PersonDetails;
}
