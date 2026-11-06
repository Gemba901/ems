import { apiClient } from "@/lib/api-client";
import type { ChartData } from "@/components/ems/org-chart/model";
export async function readOrgChart(
  token: string,
  signal?: AbortSignal,
): Promise<ChartData> {
  const response = await apiClient(
    "/api/ems/organisation/chart",
    { signal },
    token,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      Array.isArray(data.message)
        ? data.message.join(" ")
        : data.message || "Unable to load the organisation chart",
    );
  return data;
}
