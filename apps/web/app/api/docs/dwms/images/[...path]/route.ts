import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { docsChapters } from "@/lib/docs/dwms";
import { authorizeDwmsDocs } from "../../authorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Context) {
  const denied = await authorizeDwmsDocs(request);
  if (denied) return denied;

  const { path: segments } = await params;
  if (
    segments.length !== 2 ||
    !docsChapters.some((chapter) => chapter.slug === segments[0]) ||
    !/^[a-zA-Z0-9_-]+\.png$/.test(segments[1])
  ) {
    return new Response(null, { status: 404 });
  }

  try {
    const file = await readFile(path.join(process.cwd(), "content", "dwms-docs-images", segments[0], segments[1]));
    return new Response(file, {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
