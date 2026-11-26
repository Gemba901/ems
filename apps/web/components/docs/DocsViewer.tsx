"use client";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHead, TableCell } from "@/components/ui/table";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { ArrowLeft, BookOpenText, ChevronRight, ZoomIn } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { apiClient } from "@/lib/api-client";
import type { DocsChapter } from "./types";

type ProtectedImages = { sourcePrefix: string; endpointPrefix: string };

type DocsViewerProps = {
  chapters: DocsChapter[];
  activeChapter: DocsChapter;
  markdown: string;
  basePath: string;
  title: string;
  sectionLabel: string;
  backHref: string;
  backLabel: string;
  protectedImages?: ProtectedImages;
};

function MarkdownImage({ src, alt, protectedImages }: { src: string; alt: string; protectedImages?: ProtectedImages }) {
  const [open, setOpen] = useState(false);
  const token = useAuthStore((state) => state.accessToken);
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const relativePath = protectedImages && src.startsWith(protectedImages.sourcePrefix) ? src.slice(protectedImages.sourcePrefix.length) : null;
  const imagePath = relativePath && /^[a-z0-9-]+\/[a-zA-Z0-9_-]+\.png$/.test(relativePath) ? relativePath : null;
  const endpointPrefix = protectedImages?.endpointPrefix;
  const imageKey = `${src}:${token ?? ""}`;
  const imageUrl = protectedImages ? image?.key === imageKey ? image.url : null : src;

  useEffect(() => {
    if (!imagePath || !token || !endpointPrefix) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void apiClient(`${endpointPrefix}/${imagePath}`, { signal: controller.signal }, token)
      .then(async (response) => {
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ key: imageKey, url: objectUrl });
      })
      .catch(() => { /* Keep the image hidden if access fails. */ });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [endpointPrefix, imageKey, imagePath, token]);

  return (
    <>
      <Button
        variant="ghost"
        type="button"
        onClick={() => setOpen(true)}
        className="group h-auto whitespace-normal relative mx-auto my-6 block w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition hover:border-primary hover:shadow-md"
        aria-label={`Open screenshot full size: ${alt}`}
      >
        <span className="relative flex h-56 items-center justify-center overflow-hidden bg-muted p-3 sm:h-72 lg:h-80">
          {imageUrl ? <Image
            src={imageUrl}
            alt={alt}
            width={1120}
            height={1358}
            unoptimized
            className="h-full w-auto max-w-full rounded-lg object-contain shadow-sm transition duration-200 group-hover:scale-[1.015]"
          /> : <span className="text-sm text-muted-foreground">Loading image...</span>}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-foreground/80 px-3 py-1.5 text-xs font-semibold text-background shadow-lg transition group-hover:bg-primary">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            Open full size
          </span>
        </span>
        <span className="block border-t border-border bg-card px-4 py-3 text-center text-sm leading-6 text-muted-foreground">
          {alt}
        </span>
      </Button>
      {open && imageUrl && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-[min(96vw,72rem)]">
            <DialogTitle className="sr-only">{alt || "Documentation screenshot"}</DialogTitle>
            <Image
              src={imageUrl}
              alt={alt}
              width={1120}
              height={1358}
              unoptimized
              className="mx-auto max-h-[88dvh] w-auto max-w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

const markdownComponents: Omit<Components, "img"> = {
  h1: ({ children }) => <h1 className="break-words text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">{children}</h1>,
  h2: ({ children }) => <h2 className="scroll-mt-24 break-words pt-8 text-xl font-bold tracking-tight text-foreground sm:text-2xl lg:text-3xl">{children}</h2>,
  h3: ({ children }) => <h3 className="pt-4 text-lg font-bold text-foreground">{children}</h3>,
  p: ({ children }) => <p className="my-4 leading-7 text-foreground">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 marker:text-primary">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-3 pl-6 marker:font-bold marker:text-primary">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-7 text-foreground">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-6 rounded-xl border border-info bg-info-subtle px-5 py-1 text-info">{children}</blockquote>,
  hr: () => <hr className="my-8 border-border" />,
  table: ({ children }) => <div className="my-6 overflow-x-auto"><Table className="min-w-full border-collapse text-left text-sm">{children}</Table></div>,
  th: ({ children }) => <TableHead className="border border-border bg-muted px-3 py-2 font-bold text-foreground">{children}</TableHead>,
  td: ({ children }) => <TableCell className="whitespace-normal border border-border px-3 py-2 align-top text-foreground">{children}</TableCell>,
  pre: ({ children }) => <pre className="my-6 max-w-full overflow-x-auto rounded-xl bg-foreground p-4 text-sm text-muted-foreground">{children}</pre>,
  a: ({ href = "", children }) => {
    const external = href.startsWith("http");
    return <Link href={href} target={external ? "_blank" : undefined} className="font-semibold text-primary underline decoration-primary underline-offset-4 hover:decoration-primary">{children}</Link>;
  },
};

export default function DocsViewer({ chapters, activeChapter, markdown, basePath, title, sectionLabel, backHref, backLabel, protectedImages }: DocsViewerProps) {
  const chapterHref = (slug: string) => slug === chapters[0]?.slug ? basePath : `${basePath}/${slug}`;
  const components: Components = {
    ...markdownComponents,
    img: ({ src = "", alt = "" }) => <MarkdownImage src={String(src)} alt={alt} protectedImages={protectedImages} />,
  };
  return (
      <div className="mx-auto flex h-[calc(100vh-3.5rem)] w-full max-w-[1600px] items-start gap-6 overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:gap-8 lg:px-8 lg:py-8">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-72 shrink-0 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-sm lg:block">
          <div className="mb-4 flex items-center gap-2 px-2 text-sm font-bold text-foreground"><BookOpenText className="h-5 w-5 text-primary" aria-hidden="true" />{title}</div>
          <Link href={backHref} className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{backLabel}</Link>
          <nav aria-label="Documentation chapters" className="space-y-1">
            {chapters.map((chapter, index) => {
              const active = chapter.slug === activeChapter.slug;
              return <Link key={chapter.slug} href={chapterHref(chapter.slug)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-accent font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>{index + 1}</span><span>{chapter.label}</span></Link>;
            })}
          </nav>
        </aside>

        <div className="h-full min-w-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mb-4 rounded-2xl border border-border bg-card p-3 shadow-sm sm:mb-6 sm:p-4 lg:hidden">
            <Link href={backHref} className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{backLabel}</Link>
            <label htmlFor="docs-chapter" className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Documentation chapter</label>
            <NativeSelect id="docs-chapter" value={activeChapter.slug} onChange={(event) => { window.location.href = chapterHref(event.target.value); }} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground">
              {chapters.map((chapter, index) => <option key={chapter.slug} value={chapter.slug}>{index + 1}. {chapter.label}</option>)}
            </NativeSelect>
          </div>

          <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card px-4 py-6 shadow-sm sm:px-8 sm:py-8 lg:px-12">
            <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-4 text-xs font-semibold text-primary sm:mb-8 sm:pb-5 sm:text-sm"><span>{sectionLabel}</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{activeChapter.label}</span></div>
            <div className="max-w-4xl break-words text-[15px]"><ReactMarkdown components={components}>{markdown}</ReactMarkdown></div>
          </article>
        </div>
      </div>
  );
}
