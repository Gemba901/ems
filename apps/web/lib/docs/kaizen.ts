import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocsChapter } from "@/components/docs/types";

export const docsChapters: DocsChapter[] = [
  {
    slug: "overview",
    label: "What is a Daily Kaizen?",
    description: "Purpose, the five stages, and who does what.",
  },
  {
    slug: "create-kaizen",
    label: "Create a kaizen",
    description: "Use the four-step wizard to raise and submit a kaizen.",
  },
  {
    slug: "hod-review",
    label: "HOD review",
    description: "Approve, return, reject, or move a kaizen to an SGA.",
  },
  {
    slug: "implement",
    label: "Implement the kaizen",
    description: "Record the change, after photos, and the result.",
  },
  {
    slug: "verification",
    label: "Verify and close",
    description: "Complete each verification stage and close the kaizen.",
  },
  {
    slug: "overview-page",
    label: "Overview and All Kaizens",
    description: "Find your kaizens, department kaizens, and items waiting for you.",
  },
  {
    slug: "reports",
    label: "Reports",
    description: "Understand kaizen volume, pipeline, closure, and focus areas.",
  },
  {
    slug: "glossary",
    label: "Glossary",
    description: "QCDSMT, the seven wastes, and other terms.",
  },
];

export function findDocsChapter(slug: string) {
  return docsChapters.find((chapter) => chapter.slug === slug);
}

export async function readDocsChapter(slug: string) {
  const chapter = findDocsChapter(slug);
  if (!chapter) return null;
  const filePath = path.join(process.cwd(), "content", "kaizen-docs", `${slug}.md`);
  return { chapter, markdown: await readFile(filePath, "utf8") };
}
