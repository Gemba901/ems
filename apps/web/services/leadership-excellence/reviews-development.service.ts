import { apiClient } from "@/lib/api-client";
import type {
  CoachingKind,
  CoachingRecord,
  DevelopmentContext,
  Discussion,
  EffectivenessStatus,
  ImprovementAction,
  Reflection,
  ReviewDetail,
  ReviewSummary,
} from "@/components/leadership-excellence/reviews-development/types";

// Area 06 · Reviews & Development: calls to /leadership-excellence/reviews-development/*.
const BASE = "/api/leadership-excellence/reviews-development";

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await apiClient(`${BASE}${path}`, init, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(value.message) ? value.message.join(" ") : value.message || "Something went wrong. Try again.";
    throw new Error(message);
  }
  return value as T;
}

const send = <T>(method: "POST" | "PUT" | "DELETE", path: string, token: string, body?: unknown) =>
  call<T>(path, token, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const id = (v: string) => encodeURIComponent(v);

/** Plans the caller can review or coach on, with suggested periods. */
export const getDevelopmentContext = (token: string, signal?: AbortSignal) =>
  call<DevelopmentContext>("/context", token, { signal });

// ---- 06.01 · Performance reviews ----
export const getReviews = (token: string, signal?: AbortSignal) => call<ReviewSummary[]>("/reviews", token, { signal });

export const getReview = (token: string, reviewId: string, signal?: AbortSignal) =>
  call<ReviewDetail>(`/reviews/${id(reviewId)}`, token, { signal });

export const createReview = (token: string, body: { planDocumentId: string; periodStart: string; periodEnd: string; meetingDate: string }) =>
  send<ReviewDetail>("POST", "/reviews", token, body);

export const saveReflection = (token: string, reviewId: string, body: Reflection, submit = false) =>
  send<ReviewDetail>(submit ? "POST" : "PUT", `/reviews/${id(reviewId)}/${submit ? "submit" : "reflection"}`, token, body);

export const saveDiscussion = (token: string, reviewId: string, body: Partial<Discussion> & { meetingDate: string }) =>
  send<ReviewDetail>("PUT", `/reviews/${id(reviewId)}/discussion`, token, { ...body, nextReviewDate: body.nextReviewDate || undefined });

export const refreshReview = (token: string, reviewId: string) => send<ReviewDetail>("POST", `/reviews/${id(reviewId)}/refresh`, token, {});

export const returnReview = (token: string, reviewId: string, reason: string) =>
  send<ReviewDetail>("POST", `/reviews/${id(reviewId)}/return`, token, { reason });

export const approveReview = (token: string, reviewId: string) => send<ReviewDetail>("POST", `/reviews/${id(reviewId)}/approve`, token, {});

export const reviseReview = (token: string, reviewId: string, reason: string) =>
  send<ReviewDetail>("POST", `/reviews/${id(reviewId)}/revise`, token, { reason });

export const acknowledgeReview = (token: string, reviewId: string, comment: string, concern: boolean) =>
  send<ReviewDetail>("POST", `/reviews/${id(reviewId)}/acknowledge`, token, { comment: comment || undefined, concern });

export const linkReviewAction = (token: string, reviewId: string, actionId: string) =>
  send<ReviewDetail>("POST", `/reviews/${id(reviewId)}/actions`, token, { actionId });

export const unlinkReviewAction = (token: string, reviewId: string, actionId: string) =>
  send<ReviewDetail>("DELETE", `/reviews/${id(reviewId)}/actions/${id(actionId)}`, token);

// ---- 06.02 · Feedback & coaching ----
export const getCoaching = (token: string, signal?: AbortSignal) => call<CoachingRecord[]>("/coaching", token, { signal });

export const createCoaching = (
  token: string,
  body: { planDocumentId: string; kind: CoachingKind; date: string; topic: string; relatesTo: string; notes: string; support?: string },
) => send<CoachingRecord>("POST", "/coaching", token, body);

export const updateCoaching = (token: string, coachingId: string, body: { notes?: string; support?: string; response?: string }) =>
  send<CoachingRecord>("PUT", `/coaching/${id(coachingId)}`, token, body);

export const linkCoachingAction = (token: string, coachingId: string, actionId: string) =>
  send<CoachingRecord>("POST", `/coaching/${id(coachingId)}/actions`, token, { actionId });

export const unlinkCoachingAction = (token: string, coachingId: string, actionId: string) =>
  send<CoachingRecord>("DELETE", `/coaching/${id(coachingId)}/actions/${id(actionId)}`, token);

// ---- 06.03 · Improvement actions ----
export const getImprovementActions = (token: string, signal?: AbortSignal) =>
  call<ImprovementAction[]>("/improvement/actions", token, { signal });

export const recordEffectiveness = (token: string, actionId: string, body: { status: EffectivenessStatus; note: string; evidence: string }) =>
  send<ImprovementAction>("PUT", `/improvement/actions/${id(actionId)}/effectiveness`, token, body);
