// apps/web/components/onboarding/DashboardTour.tsx
"use client";

import { ModuleTour, type TourStep } from "./ModuleTour";

const TOUR_VERSION = "v1"; // bump this if you change the steps meaningfully

const STEPS: TourStep[] = [
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
  return <ModuleTour tourId="dashboard" version={TOUR_VERSION} steps={STEPS} />;
}
