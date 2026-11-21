"use client";

import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import LinkedRecordChip from "@/components/ui/LinkedRecordChip";
import { useOrgModules } from "@/hooks/useOrgModules";
import type { LinkedFiveSStandard } from "@/services/five-s.service";

// Join 12: a verified Kaizen or SGA becomes a 5S standard (and, from the standard, a routine that checks it).
// Shows the standards already made from it, and a link to standardise once it is verified and closed.
export default function StandardiseLinks({
  kind,
  id,
  status,
  standards,
}: {
  kind: "kaizen" | "sga";
  id: string;
  status: string;
  standards?: LinkedFiveSStandard[];
}) {
  const { hasModule } = useOrgModules();
  if (!hasModule("FIVE_S")) return null;
  const closed = status === "VERIFIED_CLOSED";
  return (
    <>
      {standards?.map((s) => (
        <LinkedRecordChip key={s.id} href={`/five-s/standards/${s.id}`} label="5S standard:" title={`${s.area.name} · ${s.title}`} tone="fiveS" />
      ))}
      {closed && (
        <Link
          href={`/five-s/standards/new?${kind === "kaizen" ? "fromKaizen" : "fromSga"}=${id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-50"
        >
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Standardise in 5S
        </Link>
      )}
    </>
  );
}
