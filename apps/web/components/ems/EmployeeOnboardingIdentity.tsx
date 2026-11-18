"use client";

import Link from "next/link";
import { reviewRecordHref } from "./onboarding-review-navigation";
import type { EmployeeImportSource } from "@/services/ems.service";

/** Read-only identity/provenance stays visible while the personal fields are edited. */
export default function EmployeeOnboardingIdentity({ employeeCode, sourceImport }: {
  employeeCode: string | null;
  sourceImport?: EmployeeImportSource | null;
}) {
  return <dl className="mb-4 grid grid-cols-1 gap-4 border-b border-slate-100 pb-4 sm:grid-cols-2">
    <div className="min-w-0">
      <dt className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">Employee code</dt>
      <dd className="break-words text-sm font-semibold text-slate-800">{employeeCode?.trim() || "—"}</dd>
    </div>
    <div className="min-w-0">
      <dt className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">Imported from</dt>
      <dd className="break-words text-sm text-slate-600">
        {sourceImport ? <>
          <Link href={sourceImport.recordId ? reviewRecordHref(sourceImport.batchId, sourceImport.recordId) : `/ems/onboarding/${encodeURIComponent(sourceImport.batchId)}`}
            className="font-medium text-indigo-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
            {sourceImport.label?.trim() || sourceImport.sourceFileName?.trim() || "View import batch"}
          </Link>
          {sourceImport.label?.trim() && sourceImport.sourceFileName?.trim() && sourceImport.label.trim() !== sourceImport.sourceFileName.trim() &&
            <span className="mt-1 block text-xs text-slate-500">{sourceImport.sourceFileName}</span>}
          {sourceImport.importedAt && <time dateTime={sourceImport.importedAt} className="mt-1 block text-xs text-slate-500">
            Imported on {new Date(sourceImport.importedAt).toLocaleString('en-GB', {day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'})}
          </time>}
          {sourceImport.rowNumber !== null && <span className="mt-1 block text-xs text-slate-500">Imported row {sourceImport.rowNumber}</span>}
        </> : sourceImport === null ? "No import batch recorded" : "Import source unavailable"}
      </dd>
    </div>
  </dl>;
}
