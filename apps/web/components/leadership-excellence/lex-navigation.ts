const BASE = "/leadership-excellence";

export interface LexNavigationItem {
  code: string;
  label: string;
  href: string;
}

export interface LexArea {
  id: string;
  label: string;
  name: string;
  basePath: string;
  href: string;
  items: LexNavigationItem[];
}

// The seven shared areas use the existing routes owned by their respective teams.
// Keeping both navigation levels here prevents labels and destinations drifting.
export const LEX_AREAS: LexArea[] = [
  {
    id: "01",
    label: "Strategic Direction",
    name: "Strategic Direction",
    basePath: `${BASE}/strategic-direction`,
    href: `${BASE}/strategic-direction/company-direction`,
    items: [
      {
        code: "01.01",
        label: "Company direction",
        href: `${BASE}/strategic-direction/company-direction`,
      },
      {
        code: "01.02",
        label: "Six excellence pillars",
        href: `${BASE}/strategic-direction/pillars`,
      },
      {
        code: "01.03",
        label: "Preview & finalise",
        href: `${BASE}/strategic-direction/preview`,
      },
    ],
  },
  {
    id: "02",
    label: "Organisation Framework",
    name: "Organisation & Performance Framework",
    basePath: `${BASE}/organisation-framework`,
    href: `${BASE}/organisation-framework/ems-organogram`,
    items: [
      {
        code: "02.01",
        label: "EMS & organogram",
        href: `${BASE}/organisation-framework/ems-organogram`,
      },
      {
        code: "02.02",
        label: "Positions & reporting",
        href: `${BASE}/organisation-framework/positions-reporting`,
      },
      {
        code: "02.03",
        label: "Rules & calendar",
        href: `${BASE}/organisation-framework/rules-calendar`,
      },
    ],
  },
  {
    id: "03",
    label: "Performance Planning",
    name: "Performance Planning & Alignment",
    basePath: `${BASE}/performance-planning`,
    href: `${BASE}/performance-planning/objectives`,
    items: [
      {
        code: "03.01",
        label: "SWOT findings",
        href: `${BASE}/performance-planning/swot-findings`,
      },
      {
        code: "03.02",
        label: "Review & decide",
        href: `${BASE}/performance-planning/review-findings`,
      },
      {
        code: "03.03",
        label: "Company objectives",
        href: `${BASE}/performance-planning/objectives`,
      },
      {
        code: "03.04",
        label: "Department goals",
        href: `${BASE}/performance-planning/department-plans`,
      },
      {
        code: "03.05",
        label: "Individual plans",
        href: `${BASE}/performance-planning/team-individual-plans`,
      },
      {
        code: "03.06",
        label: "Results & review",
        href: `${BASE}/performance-planning/results`,
      },
    ],
  },
  {
    id: "04",
    label: "Performance Execution",
    name: "Department & Employee Performance Execution",
    basePath: `${BASE}/execution`,
    href: `${BASE}/execution/results-entry`,
    items: [
      {
        code: "04.02",
        label: "Performance results",
        href: `${BASE}/execution/results-entry`,
      },
      {
        code: "04.02",
        label: "Delivery actions",
        href: `${BASE}/execution/delivery-actions`,
      },
      {
        code: "04.02",
        label: "Support requests",
        href: `${BASE}/execution/support-requests`,
      },
    ],
  },
  {
    id: "05",
    label: "Monitoring & Control",
    name: "Performance Monitoring & Control",
    basePath: `${BASE}/monitoring-control`,
    href: `${BASE}/monitoring-control/verify-results`,
    items: [
      {
        code: "05.01",
        label: "Verify results",
        href: `${BASE}/monitoring-control/verify-results`,
      },
      {
        code: "05.02",
        label: "Performance & gaps",
        href: `${BASE}/monitoring-control/performance-gaps`,
      },
      {
        code: "05.03",
        label: "Alerts & follow-up",
        href: `${BASE}/monitoring-control/alerts`,
      },
    ],
  },
  {
    id: "06",
    label: "Reviews & Development",
    name: "Performance Review & Development",
    basePath: `${BASE}/reviews-development`,
    href: `${BASE}/reviews-development/reviews`,
    items: [
      {
        code: "06.01",
        label: "Performance reviews",
        href: `${BASE}/reviews-development/reviews`,
      },
      {
        code: "06.02",
        label: "Feedback & coaching",
        href: `${BASE}/reviews-development/feedback-coaching`,
      },
      {
        code: "06.03",
        label: "Improvement actions",
        href: `${BASE}/reviews-development/improvement-actions`,
      },
    ],
  },
  {
    id: "07",
    label: "Performance Intelligence",
    name: "Performance Intelligence",
    basePath: `${BASE}/performance-intelligence`,
    href: `${BASE}/performance-intelligence/libraries`,
    items: [
      {
        code: "07.01",
        label: "KRA & KPI libraries",
        href: `${BASE}/performance-intelligence/libraries`,
      },
      {
        code: "07.02",
        label: "Performance dashboards",
        href: `${BASE}/performance-intelligence/dashboards`,
      },
      {
        code: "07.03",
        label: "Analysis & reports",
        href: `${BASE}/performance-intelligence/reports`,
      },
    ],
  },
];

export function getLexArea(pathname: string): LexArea | undefined {
  return LEX_AREAS.find(
    (area) =>
      pathname === area.basePath || pathname.startsWith(`${area.basePath}/`),
  );
}
