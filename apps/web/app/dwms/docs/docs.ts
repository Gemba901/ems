import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type DocsChapter = { slug: string; label: string; description: string };

export const docsChapters: DocsChapter[] = [
  { slug: "assign-task", label: "Assign Task", description: "Create and assign one-time or recurring work." },
  { slug: "raise-alert", label: "Raise Alert", description: "Create an alert and select the people involved." },
  { slug: "my-routine-work", label: "My Routine Work", description: "Find and complete scheduled standard work." },
  { slug: "tasks-assigned-to-me", label: "Tasks assigned to me", description: "Acknowledge, update, and complete owned tasks." },
  { slug: "tasks-assigned-by-me", label: "Tasks assigned by me", description: "Follow work assigned to other employees." },
  { slug: "approvals", label: "Approvals", description: "Review task completion and alert closure requests." },
  { slug: "alerts-abnormality", label: "Alerts / Abnormality", description: "Track alerts, corrective action, and abnormalities." },
  { slug: "reports", label: "Reports", description: "Understand personal, employee, department, and organization performance." },
  { slug: "employee-dwms-details", label: "Employee DWMS details", description: "View an employee's DWMS work and applicable activities." },
  { slug: "activities", label: "Activities", description: "Create and maintain reusable standard work." },
  { slug: "settings", label: "Settings", description: "Configure approval, escalation, visibility, and timing rules." },
];

export function findDocsChapter(slug: string) {
  return docsChapters.find((chapter) => chapter.slug === slug);
}

export async function readDocsChapter(slug: string) {
  const chapter = findDocsChapter(slug);
  if (!chapter) return null;
  const filePath = path.join(process.cwd(), "content", "dwms-docs", `${slug}.md`);
  return { chapter, markdown: await readFile(filePath, "utf8") };
}
