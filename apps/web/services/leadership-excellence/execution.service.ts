import { apiClient } from "@/lib/api-client";
import type { ExecutionCommand, ExecutionView } from "./execution/types";
export type * from "./execution/types";

export class ExecutionApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request(
  token: string,
  command?: ExecutionCommand,
  signal?: AbortSignal,
): Promise<ExecutionView> {
  const response = await apiClient(
    `/api/leadership-excellence/execution/${command ? "commands" : "workspace"}`,
    command
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(command),
          signal,
        }
      : { signal },
    token,
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(result.message)
      ? result.message.join("\n")
      : result.message;
    throw new ExecutionApiError(
      response.status,
      typeof message === "string"
        ? message
        : "Could not load performance execution. Please try again.",
    );
  }
  return result as ExecutionView;
}

export const ExecutionService = {
  getWorkspace: (token: string, signal?: AbortSignal) =>
    request(token, undefined, signal),
  command: (token: string, command: ExecutionCommand) =>
    request(token, command),
};
