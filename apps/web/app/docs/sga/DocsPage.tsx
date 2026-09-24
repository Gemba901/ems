"use client";

import ModuleDocsPage from "@/components/docs/ModuleDocsPage";

export default function DocsPage({ slug }: { slug: string }) {
  return <ModuleDocsPage
    slug={slug}
    apiPath="/api/docs/sga"
    basePath="/docs/sga"
    title="SGA documentation"
    sectionLabel="Small Group Activities"
    backHref="/sga"
    backLabel="Back to SGA"
  />;
}
