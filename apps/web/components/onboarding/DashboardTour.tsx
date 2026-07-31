// apps/web/components/onboarding/DashboardTour.tsx
"use client";

import { useEffect, useState } from "react";
import { Joyride, EventData, STATUS, Step } from "react-joyride";
import { useAuthStore } from "@/store/auth.store";

const TOUR_VERSION = "v1"; // bump this if you change the steps meaningfully

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Gemba",
    content: "Quick tour of where everything lives — takes about 20 seconds.",
  },
  {
    target: '[data-tour="tour-sidebar"]',
    title: "Navigation",
    content: "Everything you have access to lives here — modules, settings, admin tools.",
    placement: "right",
  },
  {
    target: '[data-tour="tour-notifications"]',
    title: "Notifications",
    content: "Approvals, invites, and updates that need your attention show up here.",
    placement: "bottom",
  },
  {
    target: '[data-tour="tour-modules"]',
    title: "Your modules",
    content: "These are the features enabled for your organization — click any card to open it.",
    placement: "top",
  },
];

export function DashboardTour() {
  const user = useAuthStore((s) => s.user);
  const [run, setRun] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;
    const key = `tour_dashboard_${TOUR_VERSION}_${user.userId}`;
    if (!localStorage.getItem(key)) setRun(true);
    setMounted(true);
  }, [user?.userId]);

  const handleEvent = (data: EventData) => {
    if (!user?.userId) return;
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      localStorage.setItem(`tour_dashboard_${TOUR_VERSION}_${user.userId}`, "1");
      setRun(false);
    }
  };

  if (!mounted) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      scrollToFirstStep
      onEvent={handleEvent}
      options={{
        primaryColor: "#4f46e5",
        zIndex: 10000,
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
      }}
    />
  );
}
