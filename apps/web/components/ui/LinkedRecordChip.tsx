import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// Pill link to a record in another improvement module (5S action / DWMS alert → Kaizen, suggestion ↔ Kaizen ↔ SGA), shown next to
// the status badge on each detail page.
const TONES = {
  suggestion: "text-sky-700 bg-sky-50 border-sky-100 hover:bg-sky-100",
  kaizen: "text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100",
  sga: "text-purple-700 bg-purple-50 border-purple-100 hover:bg-purple-100",
  fiveS: "text-amber-700 bg-amber-50 border-amber-100 hover:bg-amber-100",
  alert: "text-rose-700 bg-rose-50 border-rose-100 hover:bg-rose-100",
};

export default function LinkedRecordChip({
  href,
  label,
  title,
  tone,
}: {
  href: string;
  label: string;
  title?: string | null;
  tone: keyof typeof TONES;
}) {
  return (
    <Link
      href={href}
      title={title ?? undefined}
      className={`inline-flex max-w-full items-center gap-1.5 text-xs font-semibold border rounded-full px-3 py-1.5 transition-colors ${TONES[tone]}`}
    >
      <span className="shrink-0">{label}</span>
      {title && <span className="truncate font-normal max-w-[16rem]">{title}</span>}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}
