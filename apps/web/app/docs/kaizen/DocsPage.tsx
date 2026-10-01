"use client";

import ModuleDocsPage from "@/components/docs/ModuleDocsPage";

export default function DocsPage({ slug }: { slug: string }) {
  return <ModuleDocsPage
    slug={slug}
    apiPath="/api/docs/kaizen"
    basePath="/docs/kaizen"
    title="Kaizen documentation"
    sectionLabel="Daily Gemba Kaizen"
    backHref="/kaizen"
    backLabel="Back to Kaizen"
  />;
}
