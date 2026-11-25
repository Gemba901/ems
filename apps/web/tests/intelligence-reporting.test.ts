import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useAuthStore, type User } from "../store/auth.store";
import {
  IntelligenceApiError,
  IntelligenceReportingService,
} from "../services/leadership-excellence/performance-intelligence/reporting";

const originalFetch = globalThis.fetch;
const user: User = {
  userId: "report-user",
  name: "Report User",
  email: null,
  phone: "",
  organizationId: "report-organization",
  organizationName: "Reporting organization",
  organizationUrl: null,
  organizationTimeZone: "UTC",
  roleId: 2,
  roleLevel: "MANAGEMENT" as User["roleLevel"],
  isAdminOrg: false,
  jobTitle: null,
  departmentId: null,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  useAuthStore.getState().logout();
});

test("report and authenticated CSV use identical encoded filters and cancellation", async () => {
  useAuthStore.getState().setAuth(user, "current-token");
  const calls: { url: URL; options: RequestInit }[] = [];
  const csv = '"Measure","Actual"\r\n"Delivery, quality",0\r\n';
  globalThis.fetch = async (input, options) => {
    calls.push({
      url: new URL(String(input), "https://workspace.test"),
      options: options || {},
    });
    return String(input).includes("export.csv")
      ? new Response(csv, { headers: { "Content-Type": "text/csv" } })
      : Response.json({ generatedAt: "2027-01-01T00:00:00Z" });
  };
  const controller = new AbortController();
  const filters = {
    cycle: "2027",
    scope: "MY" as const,
    search: "Q&D + <review>",
    departmentId: undefined,
  };
  await IntelligenceReportingService.getView(
    "stale-token",
    "reports",
    filters,
    controller.signal,
  );
  const blob = await IntelligenceReportingService.exportCsv(
    "stale-token",
    filters,
    controller.signal,
  );
  assert.equal(await blob.text(), csv);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.search, calls[1].url.search);
  assert.equal(calls[1].url.searchParams.get("search"), filters.search);
  assert.equal(calls[1].url.searchParams.has("departmentId"), false);
  assert.equal(
    calls[1].url.pathname,
    "/api/leadership-excellence/performance-intelligence/reports/export.csv",
  );
  for (const { options } of calls) {
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      "Bearer current-token",
    );
    assert.equal(options.signal, controller.signal);
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
  }
});

test("CSV uses the existing session refresh and retries with the refreshed token", async () => {
  useAuthStore.getState().setAuth(user, "expired-token");
  const headers: string[] = [];
  let refreshed = false;
  globalThis.fetch = async (input, options) => {
    if (String(input) === "/api/auth/refresh") {
      refreshed = true;
      return Response.json({ accessToken: "refreshed-token", user });
    }
    headers.push(new Headers(options?.headers).get("Authorization") || "");
    return refreshed
      ? new Response("verified,csv\r\n", {
          headers: { "Content-Type": "text/csv" },
        })
      : Response.json({ message: "Session expired" }, { status: 401 });
  };
  const blob = await IntelligenceReportingService.exportCsv(
    "expired-token",
    {},
  );
  assert.equal(await blob.text(), "verified,csv\r\n");
  assert.deepEqual(headers, ["Bearer expired-token", "Bearer refreshed-token"]);
});

test("expired session and rejected refresh invalidate authentication instead of exporting an error body", async () => {
  useAuthStore.getState().setAuth(user, "expired-token");
  globalThis.fetch = async (input) =>
    Response.json(
      { message: "Sign in again" },
      { status: String(input) === "/api/auth/refresh" ? 403 : 401 },
    );
  await assert.rejects(
    IntelligenceReportingService.exportCsv("expired-token", {}),
    (error) =>
      error instanceof IntelligenceApiError &&
      error.status === 401 &&
      error.message === "Sign in again",
  );
  assert.equal(useAuthStore.getState().accessToken, null);
  assert.equal(useAuthStore.getState().user, null);
});

test("CSV reports forbidden scope errors without returning a downloadable blob", async () => {
  globalThis.fetch = async () =>
    Response.json(
      { message: ["This scope is unavailable", "Choose your department"] },
      { status: 403 },
    );
  await assert.rejects(
    IntelligenceReportingService.exportCsv("token", { scope: "ORGANIZATION" }),
    (error) =>
      error instanceof IntelligenceApiError &&
      error.status === 403 &&
      error.message === "This scope is unavailable\nChoose your department",
  );
});

test("cancelled CSV requests retain abort semantics", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_input, options) =>
    new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Cancelled", "AbortError")),
        { once: true },
      );
    });
  const request = IntelligenceReportingService.exportCsv(
    "token",
    {},
    controller.signal,
  );
  controller.abort();
  await assert.rejects(
    request,
    (error) => error instanceof Error && error.name === "AbortError",
  );
});
