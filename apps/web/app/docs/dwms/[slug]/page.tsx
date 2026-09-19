import DocsPage from "../DocsPage";

export default async function DwmsDocsChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DocsPage slug={slug} />;
}
