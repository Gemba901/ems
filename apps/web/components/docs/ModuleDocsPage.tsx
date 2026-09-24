"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import DocsViewer from "@/components/docs/DocsViewer";
import type { DocsChapter } from "@/components/docs/types";

type DocumentResponse = {
  chapters: DocsChapter[];
  chapter: DocsChapter;
  markdown: string;
};

type ViewerProps = Omit<React.ComponentProps<typeof DocsViewer>, "chapters" | "activeChapter" | "markdown">;

// Loads one chapter from /api/docs/{module}/{slug} and renders it in the shared docs viewer.
export default function ModuleDocsPage({ slug, apiPath, ...viewer }: ViewerProps & { slug: string; apiPath: string }) {
  const router = useRouter();
  const token = useAuthStore((state) => state.accessToken);
  const requestKey = `${slug}:${token ?? ""}`;
  const [document, setDocument] = useState<{ key: string; value: DocumentResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void fetch(`${apiPath}/${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 403) {
          router.replace("/");
          return;
        }
        if (!response.ok) throw new Error(response.status === 404 ? "Chapter not found." : "Unable to load documentation.");
        setDocument({ key: requestKey, value: (await response.json()) as DocumentResponse });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError({ key: requestKey, message: cause instanceof Error ? cause.message : "Unable to load documentation." });
        }
      });
    return () => controller.abort();
  }, [apiPath, requestKey, router, slug, token]);

  if (error?.key === requestKey) return <p className="p-8 text-sm text-rose-700">{error.message}</p>;
  if (document?.key !== requestKey) return <div className="p-8 text-sm text-slate-500">Loading documentation...</div>;
  return <DocsViewer
    chapters={document.value.chapters}
    activeChapter={document.value.chapter}
    markdown={document.value.markdown}
    {...viewer}
  />;
}
