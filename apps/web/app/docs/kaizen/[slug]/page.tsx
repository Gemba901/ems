import DocsPage from "../DocsPage";

export default async function KaizenDocsChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DocsPage slug={slug} />;
}
