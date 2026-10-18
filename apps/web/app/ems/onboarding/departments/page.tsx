"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Upload } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { DepartmentsService, DepartmentWithCount } from "@/services/departments.service";
import { MAX_SETUP_NAMES, namesFromColumn, reviewDepartments, suggestColumn } from "./department-setup";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-600";
const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export default function DepartmentSetupPage() {
  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}><DepartmentSetup /></ProtectedRoute>;
}

function DepartmentSetup() {
  const { accessToken } = useAuthStore();
  const [departments, setDepartments] = useState<DepartmentWithCount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState<{ created: string[]; existing: string[] } | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState("");
  const [header, setHeader] = useState(0);
  const [column, setColumn] = useState(-1);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const fileVersion = useRef(0);
  const saveLock = useRef(false);
  const results = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    setDepartments(null); setLoadError(""); setLoading(true);
    if (!accessToken) { setLoading(false); setLoadError("Sign in to load your organization's departments."); return; }
    DepartmentsService.getAll(accessToken).then(rows => {
      if (current) setDepartments(rows);
    }).catch(error => {
      if (current) setLoadError(error instanceof Error ? error.message : "Could not load departments.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [accessToken, reload]);

  const rows = useMemo<unknown[][]>(() => {
    if (!workbook || !sheet) return [];
    return XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: "", blankrows: true, raw: false });
  }, [workbook, sheet]);
  const review = useMemo(() => reviewDepartments(text, departments ?? []), [text, departments]);
  const missing = review.filter(row => row.status === "new");
  const selected = missing.filter(row => !unchecked.has(row.key));
  const invalid = review.filter(row => row.status === "invalid" || row.status === "ambiguous");

  function chooseSheet(wb: XLSX.WorkBook, name: string) {
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", blankrows: true, raw: false });
    const suggestion = suggestColumn(data);
    setSheet(name); setHeader(suggestion?.header ?? 0); setColumn(suggestion?.column ?? -1);
  }

  async function readFile(file: File) {
    const version = ++fileVersion.current;
    setReading(true); setFileError(""); setWorkbook(null); setFileName("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Use a file smaller than 10 MB, or paste the department list below.");
      const bytes = await file.arrayBuffer();
      const wb = XLSX.read(bytes, { type: "array", sheetRows: 10001 });
      if (!wb.SheetNames.length) throw new Error("This file has no worksheets.");
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name], range = XLSX.utils.decode_range(ws['!fullref'] ?? ws['!ref'] ?? 'A1');
        if (range.e.r >= 10000 || range.e.c >= 500) throw new Error("This quick setup supports sheets up to 10,000 rows and 500 columns. Paste a department list for larger files.");
      }
      if (version !== fileVersion.current) return;
      setWorkbook(wb); setFileName(file.name); chooseSheet(wb, wb.SheetNames[0]);
    } catch (error) {
      if (version === fileVersion.current) setFileError(error instanceof Error ? error.message : "Could not read that file.");
    } finally { if (version === fileVersion.current) setReading(false); }
  }

  function editText(value: string) {
    setText(value); setSaved(null); setSaveError(""); setUnchecked(new Set());
  }

  async function createSelected() {
    if (saveLock.current || !accessToken || !departments || selected.length === 0 || selected.length > MAX_SETUP_NAMES) return;
    saveLock.current = true; setBusy(true); setSaved(null); setSaveError("");
    try {
      const result = await DepartmentsService.createMany(selected.map(row => row.name), accessToken);
      setSaved(result);
      // Reflect confirmed saves immediately, even if the subsequent refresh fails.
      // These local IDs are never submitted; the next GET replaces them with real IDs.
      setDepartments(current => [...(current ?? []), ...[...result.created, ...result.existing]
        .filter(name => !(current ?? []).some(row => row.name.toLowerCase() === name.toLowerCase()))
        .map((name, i) => ({ id: `saved-${i}-${name}`, name, organizationId: "", isPlatformTeam: false, _count: { employees: 0 } }))]);
      try { setDepartments(await DepartmentsService.getAll(accessToken)); }
      catch { /* The save response is authoritative. Refresh is optional here. */ }
    } catch (error) {
      setSaveError(`${error instanceof Error ? error.message : "Could not save departments."} Your list is still here. You can retry; departments already saved will be reused.`);
    } finally {
      saveLock.current = false; setBusy(false);
      requestAnimationFrame(() => results.current?.focus());
    }
  }

  return <div className="mx-auto max-w-4xl space-y-5 pb-8">
    <div className="flex items-start gap-3">
      <Link href="/ems/onboarding/new" aria-label="Back to new import" className="mt-1 rounded p-1 text-slate-600 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link>
      <div><h1 className="text-2xl font-bold text-slate-900">Set up departments</h1>
        <p className="mt-1 text-sm text-slate-600">Add the departments in this organization before importing employees.</p></div>
    </div>
    <p className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">Start with department names. Assign department heads once the people are available. A department used in several branches only needs to be added once.</p>
    {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading existing departments…</p>}
    {loadError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{loadError} <button type="button" onClick={() => setReload(n => n + 1)} className="ml-2 underline">Retry loading</button></div>}
    {departments && <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-medium">{departments.length} existing department{departments.length === 1 ? "" : "s"}</summary>
      <ul className="mt-3 flex flex-wrap gap-2">{departments.map(row => <li key={row.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{row.name}</li>)}</ul>
      {!departments.length && <p className="mt-2 text-sm text-slate-500">Add your first departments below.</p>}
    </details>}
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">1. Add department names</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Department workbook" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} />
          <button type="button" disabled={reading} onClick={() => fileInput.current?.click()} className={secondaryClass}>{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Read from employee workbook</button>
          <span className="text-sm text-slate-500">Or paste one name per line below.</span>
        </div>
        <p className="text-xs text-slate-500">The workbook is read on this device. Only the department names you select are saved.</p>
        {fileError && <p role="alert" className="text-sm text-red-700">{fileError}</p>}
        {workbook && <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="break-all text-sm font-medium">{fileName}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">Worksheet<select aria-label="Worksheet" value={sheet} onChange={e => chooseSheet(workbook, e.target.value)} className={inputClass}>{workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</select></label>
            <label className="space-y-1 text-sm">Header row<select aria-label="Header row" value={header} onChange={e => { setHeader(Number(e.target.value)); setColumn(-1); }} className={inputClass}>{rows.slice(0, 20).map((_, i) => <option key={i} value={i}>Excel row {i + 1}</option>)}</select></label>
            <label className="space-y-1 text-sm">Department column<select aria-label="Department column" value={column} onChange={e => setColumn(Number(e.target.value))} className={inputClass}><option value={-1}>Choose column</option>{(rows[header] ?? []).map((value, i) => <option key={i} value={i}>{XLSX.utils.encode_col(i)} · {String(value || "Untitled")}</option>)}</select></label>
          </div>
          {column >= 0 && <p className="text-xs text-slate-600">First values: {namesFromColumn(rows, header, column).slice(0, 4).join(" · ") || "No values below this header."}</p>}
          <button type="button" disabled={column < 0 || !namesFromColumn(rows, header, column).length} className={secondaryClass} onClick={() => editText([text, ...namesFromColumn(rows, header, column)].filter(Boolean).join("\n"))}>Add this column to the list</button>
        </div>}
        <label className="block space-y-2 text-sm font-medium" htmlFor="department-names"><span>Department names</span><textarea id="department-names" value={text} onChange={e => editText(e.target.value)} rows={7} placeholder={"Administration\nProduction\nQuality"} className={`${inputClass} font-normal`} /></label>
      </section>
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">2. Review and create</h2>
        {!departments ? <p className="text-sm text-slate-600">Load the existing departments before reviewing new ones.</p> : <>
          {!review.length ? <p className="text-sm text-slate-500">Add names above to see what will be created.</p> : <>
            <p className="text-sm text-slate-600">{missing.length} new · {review.filter(row => row.status === "existing").length} already exist · {invalid.length} need attention</p>
            <p className="text-xs text-slate-500">Repeated names are combined. Check spelling before creating; similar names are kept separate.</p>
            {missing.length > 0 && <div className="flex flex-wrap gap-3 text-sm"><button type="button" className="font-medium text-violet-800 underline" onClick={() => setUnchecked(new Set())}>Select all new</button><button type="button" className="text-slate-600 underline" onClick={() => setUnchecked(new Set(missing.map(row => row.key)))}>Clear selection</button></div>}
            <ul className="max-h-96 divide-y divide-slate-200 overflow-auto rounded-lg border border-slate-200">
              {review.map(row => <li key={row.key} className="flex items-start gap-3 p-3">
                {row.status === "new" ? <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-violet-800" aria-label={`Create ${row.name}`} checked={!unchecked.has(row.key)} onChange={e => setUnchecked(old => { const next = new Set(old); if (e.target.checked) next.delete(row.key); else next.add(row.key); return next; })} /> : row.status === "existing" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <span className="font-bold text-amber-800" aria-hidden="true">!</span>}
                <div className="min-w-0"><p className="break-words text-sm font-medium text-slate-900">{row.name}{row.occurrences > 1 && <span className="ml-2 font-normal text-slate-500">×{row.occurrences}</span>}</p><p className={`text-xs ${row.status === "invalid" || row.status === "ambiguous" ? "text-amber-900" : "text-slate-600"}`}>{row.detail}</p></div>
              </li>)}
            </ul>
            {invalid.length > 0 && <p className="text-sm text-amber-900">Entries needing attention will not be created. Correct those names in your employee workbook before importing affected employees.</p>}
            {selected.length > MAX_SETUP_NAMES && <p role="alert" className="text-sm text-red-700">Select at most 100 new departments at a time.</p>}
            <button type="button" disabled={busy || reading || selected.length === 0 || selected.length > MAX_SETUP_NAMES} onClick={() => void createSelected()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-900 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}{busy ? "Creating departments…" : `Create ${selected.length} selected department${selected.length === 1 ? "" : "s"}`}</button>
          </>}
        </>}
      </section>
    </fieldset>
    <div ref={results} tabIndex={-1} className="scroll-mt-28 rounded-lg focus-visible:outline-violet-700">
      {saveError && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">{saveError}</p>}
      {saved && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">Saved: {saved.created.length} created{saved.existing.length ? `; ${saved.existing.length} already existed and were reused` : ""}. Selected departments are available for employee import.</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <p className="text-xs text-slate-500">Employee import and HOD assignment are separate steps.</p>
      {busy ? <span className="text-sm text-slate-500">Finishing department setup…</span> : <Link href="/ems/onboarding/new" className={secondaryClass}>Continue to employee import →</Link>}
    </div>
  </div>;
}
