"use client";

import { useCallback, useEffect, useState } from "react";
import { Joyride, EventData, STATUS, Step } from "react-joyride";
import { useAuthStore } from "@/store/auth.store";

// One guided tour per module. Runs once per user per version, and can be replayed from the
// sidebar's "Take a tour" button. Steps are a CSS selector (or "body" for a centred card);
// steps whose target isn't on screen when the tour starts are dropped, so one list adapts to
// the viewer's role (hidden nav items), the current page and the screen size.

export type TourStep = Omit<Step, "target"> & { target: string };

const START_EVENT = "gemba:start-tour";

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
}

export function ModuleTour({ tourId, steps, version = "v1" }: ModuleTourProps) {
  const userId = useAuthStore((s) => s.user?.userId);
  const [run, setRun] = useState<{ id: number; steps: Step[] } | null>(null);
  const storageKey = `tour_${tourId}_${version}_${userId}`;

  const start = useCallback(() => {
    const active = visibleSteps(steps);
    if (active.length) setRun((previous) => ({ id: (previous?.id ?? 0) + 1, steps: active }));
  }, [steps]);

  useEffect(() => {
    if (!userId) return;
    try {
      if (localStorage.getItem(storageKey)) return;
    } catch {
      return;
    }
    const timer = setTimeout(start, 600); // let the page render its targets first
    return () => clearTimeout(timer);
  }, [userId, storageKey, start]);

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
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
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
