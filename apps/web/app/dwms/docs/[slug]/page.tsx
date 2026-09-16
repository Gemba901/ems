import { notFound } from "next/navigation";
import DocsViewer from "../DocsViewer";
import { docsChapters, readDocsChapter } from "../docs";

export function generateStaticParams() {
  return docsChapters.filter((chapter) => chapter.slug !== "assign-task").map((chapter) => ({ slug: chapter.slug }));
}

export default async function DwmsDocsChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const document = await readDocsChapter(slug);
  if (!document) notFound();
  return <DocsViewer chapters={docsChapters} activeChapter={document.chapter} markdown={document.markdown} />;
}
