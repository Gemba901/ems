"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import { ArrowLeft, BookOpenText, ChevronRight, X, ZoomIn } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import type { DocsChapter } from "./docs";

function MarkdownImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const websiteSrc = src.startsWith("../../public/")
    ? src.slice("../../public".length)
    : src;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative mx-auto my-6 block w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        aria-label={`Open screenshot full size: ${alt}`}
      >
        <span className="relative flex h-56 items-center justify-center overflow-hidden bg-slate-100 p-3 sm:h-72 lg:h-80">
          <Image
            src={websiteSrc}
            alt={alt}
            width={1120}
            height={1358}
            className="h-full w-auto max-w-full rounded-lg object-contain shadow-sm transition duration-200 group-hover:scale-[1.015]"
          />
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition group-hover:bg-indigo-700">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            Open full size
          </span>
        </span>
        <span className="block border-t border-slate-200 bg-white px-4 py-3 text-center text-sm leading-6 text-slate-600">
          {alt}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg"
              aria-label="Close screenshot"
            >
              <X className="h-5 w-5" />
            </button>
            <Image
              src={websiteSrc}
              alt={alt}
              width={1120}
              height={1358}
              className="max-h-[92vh] w-auto max-w-full rounded-xl object-contain shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="break-words text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">{children}</h1>,
  h2: ({ children }) => <h2 className="scroll-mt-24 break-words pt-8 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">{children}</h2>,
  h3: ({ children }) => <h3 className="pt-4 text-lg font-bold text-slate-950">{children}</h3>,
  p: ({ children }) => <p className="my-4 leading-7 text-slate-700">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
  ul: ({ children }) => <ul className="my-4 list-disc space-y-2 pl-6 marker:text-indigo-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-4 list-decimal space-y-3 pl-6 marker:font-bold marker:text-indigo-600">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-7 text-slate-700">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-1 text-blue-950">{children}</blockquote>,
  hr: () => <hr className="my-8 border-slate-200" />,
  table: ({ children }) => <div className="my-6 overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-3 py-2 font-bold text-slate-900">{children}</th>,
  td: ({ children }) => <td className="border border-slate-200 px-3 py-2 align-top text-slate-700">{children}</td>,
  pre: ({ children }) => <pre className="my-6 max-w-full overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm text-slate-100">{children}</pre>,
  a: ({ href = "", children }) => {
    const external = href.startsWith("http");
    return <Link href={href} target={external ? "_blank" : undefined} className="font-semibold text-indigo-700 underline decoration-indigo-200 underline-offset-4 hover:decoration-indigo-600">{children}</Link>;
  },
  img: ({ src = "", alt = "" }) => (
    <MarkdownImage src={String(src)} alt={alt} />
  ),
};

export default function DocsViewer({ chapters, activeChapter, markdown }: { chapters: DocsChapter[]; activeChapter: DocsChapter; markdown: string }) {
  return (
    <ProtectedRoute>
      <div className="mx-auto flex w-full max-w-[1600px] items-start gap-6 px-3 py-4 sm:px-6 sm:py-6 lg:gap-8 lg:px-8 lg:py-8">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-72 shrink-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
          <div className="mb-4 flex items-center gap-2 px-2 text-sm font-bold text-slate-900"><BookOpenText className="h-5 w-5 text-indigo-600" aria-hidden="true" />DWMS documentation</div>
          <Link href="/dwms" className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Daily Work</Link>
          <nav aria-label="Documentation chapters" className="space-y-1">
            {chapters.map((chapter, index) => {
              const active = chapter.slug === activeChapter.slug;
              return <Link key={chapter.slug} href={chapter.slug === "assign-task" ? "/dwms/docs" : `/dwms/docs/${chapter.slug}`} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-indigo-50 font-semibold text-indigo-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${active ? "bg-indigo-600 text-white" : "border border-slate-200 text-slate-500"}`}>{index + 1}</span><span>{chapter.label}</span></Link>;
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4 lg:hidden">
            <Link href="/dwms" className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-700"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to Daily Work</Link>
            <label htmlFor="docs-chapter" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Documentation chapter</label>
            <select id="docs-chapter" value={activeChapter.slug} onChange={(event) => { window.location.href = event.target.value === "assign-task" ? "/dwms/docs" : `/dwms/docs/${event.target.value}`; }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900">
              {chapters.map((chapter, index) => <option key={chapter.slug} value={chapter.slug}>{index + 1}. {chapter.label}</option>)}
            </select>
          </div>

          <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-6 shadow-sm sm:px-8 sm:py-8 lg:px-12">
            <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4 text-xs font-semibold text-indigo-700 sm:mb-8 sm:pb-5 sm:text-sm"><span>Daily Work Management</span><ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{activeChapter.label}</span></div>
            <div className="max-w-4xl break-words text-[15px]"><ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown></div>
          </article>
        </main>
      </div>
    </ProtectedRoute>
  );
}
