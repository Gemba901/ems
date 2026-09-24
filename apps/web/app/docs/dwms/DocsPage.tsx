"use client";

import ModuleDocsPage from "@/components/docs/ModuleDocsPage";

export default function DocsPage({ slug }: { slug: string }) {
  return <ModuleDocsPage
    slug={slug}
    apiPath="/api/docs/dwms"
    basePath="/docs/dwms"
    title="DWMS documentation"
    sectionLabel="Daily Work Management"
    backHref="/dwms"
    backLabel="Back to Daily Work"
    protectedImages={{ sourcePrefix: "../../public/dwms-docs/", endpointPrefix: "/api/docs/dwms/images" }}
  />;
}
