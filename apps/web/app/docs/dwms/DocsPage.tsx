"use client";

import ModuleDocsPage from "@/components/docs/ModuleDocsPage";

export default function DocsPage({ slug }: { slug: string }) {
  return <ModuleDocsPage
    slug={slug}
    apiPath="/api/docs/dwms"
    basePath="/docs/dwms"
    title="RTW documentation"
    sectionLabel="Routine and Task Management"
    backHref="/dwms"
    backLabel="Back to Routine and Task Management"
    protectedImages={{ sourcePrefix: "../../public/dwms-docs/", endpointPrefix: "/api/docs/dwms/images" }}
  />;
}
