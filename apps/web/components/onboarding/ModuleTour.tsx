"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Joyride, EventData, STATUS, Step } from "react-joyride";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";

// One guided tour per module. Runs once per person per version (remembered on their account, so a
// new device or browser doesn't replay it), and can be replayed from the "Take a tour" button. Steps are a CSS selector (or "body" for a centred card);
// steps whose target isn't on screen when the tour starts are dropped, so one list adapts to
// the viewer's role (hidden nav items), the current page and the screen size.

export type TourStep = Omit<Step, "target"> & { target: string };

const START_EVENT = "gemba:start-tour";

// Only one tour on screen at a time. A page tour (e.g. a form walkthrough) that would auto-start
// while the module tour is still open waits for it to finish instead of stacking on top.
let activeTourId: string | null = null;

export function startTour(tourId: string) {
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: tourId }));
}

// The sidebar renders each link twice (collapsed rail + full panel), so pick the copy that's showing.
function firstVisible(selector: string) {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) =>
      element.checkVisibility
        ? element.checkVisibility({ visibilityProperty: true })
        : element.getClientRects().length > 0,
    ) ?? null
  );
}

function visibleSteps(steps: TourStep[]): Step[] {
  return steps.flatMap((step) => {
    if (step.target === "body") return [step as Step];
    if (!firstVisible(step.target)) return [];
    return [{ ...step, target: () => firstVisible(step.target) }];
  });
}

interface ModuleTourProps {
  tourId: string;
  steps: TourStep[];
  /** Bump when the steps change meaningfully so everyone sees the tour again. */
  version?: string;
  /** Delay before the first automatic run, so the page can render its targets. */
  startDelay?: number;
}

export function ModuleTour({ tourId, steps, version = "v1", startDelay = 600 }: ModuleTourProps) {
  const userId = useAuthStore((s) => s.user?.userId);
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [run, setRun] = useState<{ id: number; steps: Step[] } | null>(null);
  const tourKey = `${tourId}_${version}`;
  const storageKey = `tour_${tourKey}_${userId}`; // per-browser cache of the account flag

  const completedQueryKey = ["completed-tours", userId];
  const { data: completedTours, isError } = useQuery({
    queryKey: completedQueryKey,
    queryFn: () => AuthService.getCompletedTours(token!),
    enabled: !!userId && !!token,
    staleTime: Infinity,
    retry: 1,
  });
  // Wait for the account's list before deciding; if it can't be loaded, fall back to this browser.
  const completedLoaded = completedTours !== undefined || isError;
  const completedOnAccount = completedTours?.includes(tourKey) ?? false;

  const markCompleted = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    if (!token || completedOnAccount) return;
    queryClient.setQueryData<string[]>(completedQueryKey, (previous) => [...(previous ?? []), tourKey]);
    AuthService.markTourCompleted(token, tourKey).catch(() => {});
  };

  const start = useCallback(() => {
    const active = visibleSteps(steps);
    if (!active.length) return;
    activeTourId = tourId;
    setRun((previous) => ({ id: (previous?.id ?? 0) + 1, steps: active }));
  }, [steps, tourId]);

  useEffect(() => {
    if (!userId || !completedLoaded || completedOnAccount) return;
    try {
      if (localStorage.getItem(storageKey)) {
        // Seen in this browser before the account remembered tours: record it on the account too.
        if (token && completedTours) AuthService.markTourCompleted(token, tourKey).catch(() => {});
        return;
      }
    } catch {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const startWhenFree = () => {
      if (activeTourId && activeTourId !== tourId) {
        timer = setTimeout(startWhenFree, 800);
        return;
      }
      start();
    };
    timer = setTimeout(startWhenFree, startDelay); // let the page render its targets first
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the inputs to the decision change
  }, [userId, storageKey, start, startDelay, tourId, completedLoaded, completedOnAccount]);

  // Release the slot if the page changes mid-tour.
  useEffect(() => () => {
    if (activeTourId === tourId) activeTourId = null;
  }, [tourId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onStart = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== tourId) return;
      timer = setTimeout(start, 100); // let a closing mobile drawer hide first
    };
    window.addEventListener(START_EVENT, onStart);
    return () => {
      window.removeEventListener(START_EVENT, onStart);
      clearTimeout(timer);
    };
  }, [tourId, start]);

  const handleEvent = (data: EventData) => {
    if (data.status !== STATUS.FINISHED && data.status !== STATUS.SKIPPED) return;
    markCompleted();
    if (activeTourId === tourId) activeTourId = null;
    setRun(null);
  };

  if (!run) return null;

  return (
    <Joyride
      key={run.id}
      steps={run.steps}
      run
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      locale={{ last: "Finish", skip: "Skip tour", nextWithProgress: "Next ({current} of {total})" }}
      styles={{
        tooltip: { fontFamily: "inherit", borderRadius: 16, padding: 20, maxWidth: 360 },
        tooltipContainer: { textAlign: "left" },
        tooltipTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
        tooltipContent: { fontSize: 14, lineHeight: 1.55, color: "#475569", padding: "8px 0 4px" },
        buttonPrimary: { fontSize: 14, fontWeight: 600, borderRadius: 10, padding: "8px 14px" },
        buttonBack: { fontSize: 14, fontWeight: 500 },
        buttonSkip: { fontSize: 13, color: "#64748b" },
      }}
      options={{
        primaryColor: "#4f46e5",
        zIndex: 10000,
        showProgress: true,
        skipBeacon: true,
        closeButtonAction: "skip",
        overlayClickAction: false,
        buttons: ["back", "close", "primary", "skip"],
      }}
    />
  );
}
