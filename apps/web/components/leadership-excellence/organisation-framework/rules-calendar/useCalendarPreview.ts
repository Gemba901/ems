"use client";
import { useEffect, useRef, useState } from "react";
import {
  calendarsApi,
  type CalendarPreview,
} from "@/services/leadership-excellence/rules-calendar.service";
import { calendarIssues } from "./calendar-issues";
import type {
  CalendarRules,
  Frequency,
  ApprovedCalendarSnapshot,
} from "./calendar-model";
import { displayDate } from "./calendar-editor";

/** Each response belongs to exactly one input. Older requests cannot replace it. */
export function useCalendarPreview(
  rules: CalendarRules,
  frequency: Frequency,
  snapshot: ApprovedCalendarSnapshot | null,
  enabled: boolean,
  token: string,
  retry: number,
) {
  const sequence = useRef(0);
  const [state, setState] = useState<{
    key: string;
    value: CalendarPreview | null;
    error: string;
    busy: boolean;
    retryable?: boolean;
    accessError?: boolean;
  }>({ key: "", value: null, error: "", busy: false });
  const key = JSON.stringify([
    rules,
    frequency,
    snapshot?.periods[frequency],
    snapshot?.reviews,
    retry,
  ]);
  const validation = snapshot
    ? ""
    : (calendarIssues(rules, false)[0]?.message ?? "");
  useEffect(() => {
    const id = ++sequence.current;
    if (!enabled) return;
    if (validation) {
      setState({ key, value: null, error: validation, busy: false });
      return;
    }
    if (snapshot) {
      setState({
        key,
        value: {
          periods: snapshot.periods[frequency] ?? [],
          reviews: snapshot.reviews,
          warnings: snapshot.warnings,
        },
        error: "",
        busy: false,
      });
      return;
    }
    const controller = new AbortController();
    setState({ key, value: null, error: "", busy: true });
    const timer = setTimeout(() => {
      void calendarsApi
        .preview(token, rules, frequency, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted && sequence.current === id)
            setState({ key, value, error: "", busy: false });
        })
        .catch((error) => {
          if (!controller.signal.aborted && sequence.current === id)
            setState({
              key,
              value: null,
              error:
                error instanceof Error
                  ? error.message.replace(/\b\d{4}-\d{2}-\d{2}\b/g, displayDate)
                  : "Could not update the preview. Try again.",
              busy: false,
              accessError:
                !!error &&
                typeof error === "object" &&
                "status" in error &&
                [401, 403].includes(Number(error.status)),
              retryable:
                !(error && typeof error === "object" && "status" in error) ||
                Number((error as { status?: number }).status) >= 500 ||
                Number((error as { status?: number }).status) === 429 ||
                Number((error as { status?: number }).status) === 404,
            });
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
    // key contains every rule; do not restart because a function or object was recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, token]);
  return state.key === key
    ? state
    : {
        key,
        value: null,
        error: validation,
        busy: enabled && !validation,
        retryable: false,
        accessError: false,
      };
}
