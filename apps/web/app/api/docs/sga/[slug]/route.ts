import "server-only";
import { authorizeModuleDocs } from "@/lib/docs/authorize";
import { docsChapters, readDocsChapter } from "@/lib/docs/sga";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Context) {
  const denied = await authorizeModuleDocs(request, "SGA");
  if (denied) return denied;

  const { slug } = await params;
  const document = await readDocsChapter(slug);
  if (!document) return new Response(null, { status: 404 });
  return Response.json(
    { chapters: docsChapters, ...document },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
