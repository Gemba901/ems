"use client";
import { useEffect, useRef, useState } from "react";
import {
  calendarsApi,
  type CalendarPreview,
} from "@/services/leadership-excellence/rules-calendar.service";
import type {
  CalendarRules,
  Frequency,
  ApprovedCalendarSnapshot,
} from "./calendar-model";
import { previewIssue } from "./calendar-editor";

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
  }>({ key: "", value: null, error: "", busy: false });
  const key = JSON.stringify([
    rules,
    frequency,
    snapshot?.periods[frequency],
    snapshot?.reviews,
    retry,
  ]);
  const validation = snapshot ? "" : previewIssue(rules);
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
          periods: snapshot.periods[frequency],
          reviews: snapshot.reviews,
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
                  ? error.message
                  : "Could not update the preview. Try again.",
              busy: false,
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
    : { key, value: null, error: validation, busy: enabled && !validation };
}
