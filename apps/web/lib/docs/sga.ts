import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocsChapter } from "@/components/docs/types";

export const docsChapters: DocsChapter[] = [
  {
    slug: "overview",
    label: "What is an SGA?",
    description: "Purpose, the six stages, and who does what.",
  },
  {
    slug: "create-sga",
    label: "Create an SGA",
    description: "Use the four-step wizard to raise and submit an SGA.",
  },
  {
    slug: "hod-approval",
    label: "HOD approval",
    description: "Approve, return, or reject a submitted SGA.",
  },
  {
    slug: "run-sga",
    label: "Run the SGA",
    description: "Analyse the problem, plan actions, implement, and check results.",
  },
  {
    slug: "verification",
    label: "Verify and close",
    description: "Submit for verification and complete each verification stage.",
  },
  {
    slug: "overview-page",
    label: "Overview and All SGAs",
    description: "Find your SGAs, department SGAs, and items waiting for you.",
  },
  {
    slug: "reports",
    label: "Reports",
    description: "Understand SGA volume, pipeline, closure, and focus areas.",
  },
  {
    slug: "glossary",
    label: "Glossary",
    description: "QCDSMT, the seven wastes, Fishbone, Why-Why, and other terms.",
  },
];

export function findDocsChapter(slug: string) {
  return docsChapters.find((chapter) => chapter.slug === slug);
}

export async function readDocsChapter(slug: string) {
  const chapter = findDocsChapter(slug);
  if (!chapter) return null;
  const filePath = path.join(process.cwd(), "content", "sga-docs", `${slug}.md`);
  return { chapter, markdown: await readFile(filePath, "utf8") };
}
