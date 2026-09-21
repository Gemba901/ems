import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocsChapter } from "@/components/docs/types";

export const docsChapters: DocsChapter[] = [
  {
    slug: "assign-task",
    label: "Assign Task",
    description: "Create and assign one-time or recurring work.",
  },
  {
    slug: "raise-alert",
    label: "Raise Alert",
    description: "Create an alert and select the people involved.",
  },
  {
    slug: "my-routine-work",
    label: "Home and Routine Work",
    description: "Review your routine dashboard and scheduled standard work.",
  },
  {
    slug: "tasks-assigned-to-me",
    label: "Tasks assigned to me",
    description: "Acknowledge, update, and complete owned tasks.",
  },
  {
    slug: "tasks-assigned-by-me",
    label: "Tasks assigned by me",
    description: "Follow work assigned to other employees.",
  },
  {
    slug: "approvals",
    label: "Approvals",
    description: "Review task completion requests.",
  },
  {
    slug: "alerts-abnormality",
    label: "Alerts and Abnormalities",
    description: "Review alert histories, abnormalities, and acknowledgments.",
  },
  {
    slug: "reports",
    label: "Reports",
    description:
      "Understand personal, employee, department, and organization performance.",
  },
  {
    slug: "employee-dwms-details",
    label: "Employee DWMS details",
    description: "View an employee's DWMS work and applicable activities.",
  },
  {
    slug: "activities",
    label: "Activities",
    description: "Create and maintain reusable standard work.",
  },
  {
    slug: "settings",
    label: "Settings",
    description: "Configure task approvals and analytics visibility.",
  },
];

export function findDocsChapter(slug: string) {
  return docsChapters.find((chapter) => chapter.slug === slug);
}

export async function readDocsChapter(slug: string) {
  const chapter = findDocsChapter(slug);
  if (!chapter) return null;
  const filePath = path.join(
    process.cwd(),
    "content",
    "dwms-docs",
    `${slug}.md`,
  );
  return { chapter, markdown: await readFile(filePath, "utf8") };
}
