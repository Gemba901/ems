import type { TourStep } from "./ModuleTour";

// Step copy for each module's guided tour. Written for people who have never used the system:
// say what the thing is for in everyday words, not what the screen is called.
// Targets: nav(href) points at a sidebar link or action; steps for links the viewer can't see
// (role-gated) or targets not on the current page are skipped automatically.

const nav = (href: string) => `[data-tour="nav:${href}"]`;

// Only visible on phones/tablets, where the sidebar is hidden behind the menu button.
const MENU_STEP: TourStep = {
  target: '[data-tour="tour-menu"]',
  title: "Open the menu",
  content: "Tap here to see every section of this module. Everything in this tour lives in that menu.",
  placement: "bottom",
};

const REPLAY_STEP: TourStep = {
  target: '[data-tour="tour-replay"]',
  title: "Need a reminder?",
  content: "Click Take a tour any time to see this guide again.",
  placement: "right",
};

export const SIMS_TOUR: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Suggestions & Ideas",
    content:
      "Anyone can share an idea here to make work safer, faster, cheaper or better. Each idea is reviewed, and the good ones are put into action. This short tour shows you around.",
  },
  MENU_STEP,
  {
    target: nav("/sims/new"),
    title: "Share an idea",
    content:
      "Start here. Describe the problem you see and how you would fix it. Adding a photo helps. It takes about two minutes.",
    placement: "right",
  },
  {
    target: nav("/sims/my-suggestions"),
    title: "Follow your ideas",
    content: "Every idea you have shared is listed here, with where it is now: under review, approved, implemented, and so on.",
    placement: "right",
  },
  {
    target: nav("/sims/queue"),
    title: "Review your team's ideas",
    content:
      "Ideas from your department arrive here. Open one to approve it, put it on hold, send it to a team project (SGA) or decline it, with a short note to the person who shared it.",
    placement: "right",
  },
  {
    target: nav("/sims/all"),
    title: "All suggestions",
    content: "Every suggestion in the organisation, in one list you can search and filter.",
    placement: "right",
  },
  {
    target: nav("/sims/analytics"),
    title: "See the results",
    content: "Charts show how many ideas were shared, approved and put into action, by department and over time.",
    placement: "right",
  },
  {
    target: nav("/sims/committees"),
    title: "Committees",
    content: "Groups of people who look at bigger ideas together. You will see the committees you belong to.",
    placement: "right",
  },
  REPLAY_STEP,
];

export const DWMS_TOUR: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Daily Work Management",
    content:
      "This is your to-do list for work. See what you need to do today, handle tasks other people give you, and raise a flag quickly when something goes wrong.",
  },
  MENU_STEP,
  {
    target: nav("/dwms"),
    title: "Your day at a glance",
    content: "Home shows today's work, what is overdue, current alerts and how much you have completed.",
    placement: "right",
  },
  {
    target: nav("/dwms/routine-work"),
    title: "Routine work",
    content:
      "The jobs you repeat every day, week or month. They appear here automatically on the right days. Tick them off when they are done.",
    placement: "right",
  },
  {
    target: nav("/dwms/tasks"),
    title: "Tasks given to you",
    content: "One-off jobs that someone assigned to you, each with a due date. Open one to update it or mark it complete.",
    placement: "right",
  },
  {
    target: nav("/dwms/actions/new?mode=TASK"),
    title: "Give someone a task",
    content: "Choose the person, describe the job and set a due date. They are notified straight away.",
    placement: "right",
  },
  {
    target: nav("/dwms/actions/new?mode=ALERT"),
    title: "Raise an alert",
    content:
      "Something has gone wrong or is about to: a machine down, a delay, a safety risk. Raise an alert so the responsible person knows immediately.",
    placement: "right",
  },
  {
    target: nav("/dwms/alerts"),
    title: "Alerts",
    content:
      "Alerts you raised or that you are responsible for. The responsible person writes a short note to confirm they have seen each one.",
    placement: "right",
  },
  {
    target: nav("/dwms/abnormalities"),
    title: "Repeat problems",
    content: "When the same alert is raised three times, it becomes an abnormality: a problem that keeps coming back and needs a lasting fix.",
    placement: "right",
  },
  {
    target: nav("/dwms/approvalTasks"),
    title: "Approvals",
    content: "Some tasks need a sign-off when they are finished. The ones waiting for your approval are here.",
    placement: "right",
  },
  {
    target: nav("/dwms/dashboard"),
    title: "Reports",
    content: "See how well work is getting done: completion rates, overdue work and performance by person and team.",
    placement: "right",
  },
  {
    target: nav("/docs/dwms"),
    title: "Step-by-step help",
    content: "Illustrated guides for every screen, if you get stuck.",
    placement: "right",
  },
  REPLAY_STEP,
];

// Kaizen and SGA share an overview layout (KPI cards + list tabs), tagged on those pages.
const overviewSteps = (noun: string): TourStep[] => [
  {
    target: '[data-tour="overview-kpis"]',
    title: "Your numbers",
    content: `A quick count of your ${noun}s, the ones being worked on, the ones waiting for your review and the ones closed this month.`,
    placement: "bottom",
  },
  {
    target: '[data-tour="overview-tabs"]',
    title: "Your lists",
    content: `Switch between your own ${noun}s, your department's, and the ones waiting for you to check.`,
    placement: "bottom",
  },
];

export const KAIZEN_TOUR: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Daily Gemba Kaizen",
    content:
      "A Kaizen is a small improvement you can make yourself in your own work area, usually within days. Spot a problem, fix it, and show the before and after.",
  },
  MENU_STEP,
  {
    target: nav("/kaizen/new"),
    title: "Start a Kaizen",
    content: "Say what you noticed and what will get better, and add a 'before' photo. You can save it and finish later.",
    placement: "right",
  },
  ...overviewSteps("Kaizen"),
  {
    target: nav("/kaizen/all"),
    title: "All Kaizens",
    content: "Every Kaizen across the organisation, with filters by department and status.",
    placement: "right",
  },
  {
    target: nav("/kaizen/reports"),
    title: "Reports",
    content: "See how many improvements were made, by department, and what they achieved.",
    placement: "right",
  },
  {
    target: nav("/docs/kaizen"),
    title: "Step-by-step help",
    content: "Plain-language guides for each stage, if you get stuck.",
    placement: "right",
  },
  {
    target: "body",
    placement: "center",
    title: "Always know what's next",
    content:
      "Open any Kaizen and the coloured banner at the top tells you what happens next and whose turn it is: yours, your head of department's, or a reviewer's.",
  },
  REPLAY_STEP,
];

export const SGA_TOUR: TourStep[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to Small Group Activities",
    content:
      "An SGA is for a bigger problem that needs a team. A small group meets regularly, finds the real cause, agrees what to do, and proves that it worked.",
  },
  MENU_STEP,
  {
    target: nav("/sga/new"),
    title: "Start an SGA",
    content:
      "Explain the problem and why it matters, then choose your team and how often you will meet. Your head of department approves it before the work begins.",
    placement: "right",
  },
  ...overviewSteps("SGA"),
  {
    target: nav("/sga/all"),
    title: "All SGAs",
    content: "Every SGA across the organisation, with filters by department and status.",
    placement: "right",
  },
  {
    target: nav("/sga/reports"),
    title: "Reports",
    content: "See how many team projects are running, by department, and the benefits they delivered.",
    placement: "right",
  },
  {
    target: nav("/docs/sga"),
    title: "Step-by-step help",
    content: "Plain-language guides for each stage, if you get stuck.",
    placement: "right",
  },
  {
    target: "body",
    placement: "center",
    title: "One stage at a time",
    content:
      "Inside an SGA, the work is laid out in order: team, meetings, root cause, action plan and results. Only the current stage is open, and a banner at the top tells you what to do next.",
  },
  REPLAY_STEP,
];
