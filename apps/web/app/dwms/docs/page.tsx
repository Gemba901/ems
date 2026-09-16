import DocsViewer from "./DocsViewer";
import { docsChapters, readDocsChapter } from "./docs";

export default async function DwmsDocsPage() {
  const document = await readDocsChapter("assign-task");
  if (!document) return null;
  return <DocsViewer chapters={docsChapters} activeChapter={document.chapter} markdown={document.markdown} />;
}
