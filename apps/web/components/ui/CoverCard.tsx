import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TenantImage } from "@/components/files/TenantImage";

// Course-catalogue style card: cover on top, title in the body, status strip along the bottom.
// `tone` is a status badge class pair (e.g. "bg-amber-100 text-amber-700"); it tints the cover
// when there is no photo and colours the footer label.
export function CoverCard({
  href,
  title,
  meta,
  coverSrc,
  coverIcon,
  tone,
  statusLabel,
  cta,
}: {
  href: string;
  title: string;
  meta: string;
  coverSrc?: string | null;
  coverIcon: React.ReactNode;
  tone: string;
  statusLabel: string;
  cta?: string;
}) {
  const textTone = tone.split(" ").find((c) => c.startsWith("text-")) ?? "text-slate-600";
  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={`relative h-32 overflow-hidden ${coverSrc ? "bg-slate-100" : tone}`}>
        {coverSrc ? (
          <TenantImage src={coverSrc} alt={title} className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center opacity-70 [&_svg]:h-12 [&_svg]:w-12">{coverIcon}</div>
        )}
      </div>
      <div className="flex-1 px-4 pt-3 pb-4">
        <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">{title}</p>
        <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{meta}</p>
      </div>
      <div className="border-t border-slate-100 px-4 py-2.5 text-center">
        {cta ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-indigo-600">
            {cta} <ArrowRight className="h-3 w-3" />
          </span>
        ) : (
          <span className={`text-[11px] font-bold uppercase tracking-wide ${textTone}`}>{statusLabel}</span>
        )}
      </div>
    </Link>
  );
}

export function CoverCardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}
