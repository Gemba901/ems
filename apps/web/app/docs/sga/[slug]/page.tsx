import DocsPage from "../DocsPage";

export default async function SgaDocsChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <DocsPage slug={slug} />;
}
