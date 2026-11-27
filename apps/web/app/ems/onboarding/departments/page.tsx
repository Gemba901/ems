"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { ArrowLeft, Building2, CheckCircle2, Loader2, Upload } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuthStore } from "@/store/auth.store";
import { Role } from "@/types/role";
import { DepartmentsService, DepartmentWithCount } from "@/services/departments.service";
import { MAX_SETUP_NAMES, columnSummary, departmentColumnWarnings, nameKey, namesFromColumn, reviewDepartments, sheetOrigin, suggestColumn } from "./department-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table } from "@/components/ui/table";

const inputClass = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const secondaryClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50";

export default function DepartmentSetupPage() {
  return <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}><DepartmentSetup /></ProtectedRoute>;
}

// Opened from Organisation → Departments, Back returns there; otherwise it returns to the import, as before.
const RETURN_TARGETS: Record<string, string> = { "/ems/organisation": "Back to Organisation" };

function DepartmentSetup() {
  const [back, setBack] = useState({ href: "/ems/onboarding/new", label: "Back to new import" });
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("returnTo");
    if (target && RETURN_TARGETS[target]) setBack({ href: target, label: RETURN_TARGETS[target] });
  }, []);
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
  // Where the chosen worksheet starts (sheets don't always begin at A1), so labels show real Excel rows/columns.
  const [origin, setOrigin] = useState({ row: 0, col: 0 });
  // What the last "Add this column" did, so HR sees the effect straight away.
  const [added, setAdded] = useState<{ values: number; distinct: number; created: number; existing: number; attention: number; column: string } | null>(null);
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
    setOrigin(sheetOrigin(wb.Sheets[name]?.['!ref']));
  }

  /** Use another row as the header row, and pick its department column if it has one (never an arbitrary column). */
  function chooseHeader(row: number) {
    setHeader(row);
    setColumn(suggestColumn([rows[row] ?? []])?.column ?? -1);
  }

  // Real Excel labels for a grid row / column.
  const excelRow = (i: number) => origin.row + i + 1;
  const excelCol = (c: number) => XLSX.utils.encode_col(origin.col + c);

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
    setText(value); setSaved(null); setSaveError(""); setUnchecked(new Set()); setAdded(null);
  }

  /** Add the chosen column's values to the list, then report how many are new (and selected), existing or need attention. */
  function addColumn() {
    const names = namesFromColumn(rows, header, column);
    const next = [text, ...names].filter(Boolean).join("\n");
    editText(next);
    const keys = new Set(names.map(nameKey));
    const status = reviewDepartments(next, departments ?? []).filter((row) => keys.has(row.key));
    setAdded({
      values: names.length,
      distinct: keys.size,
      created: status.filter((row) => row.status === "new").length,
      existing: status.filter((row) => row.status === "existing").length,
      attention: status.filter((row) => row.status === "invalid" || row.status === "ambiguous").length,
      column: excelCol(column),
    });
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
      <Link href={back.href} aria-label={back.label} className="mt-1 rounded p-1 text-muted-foreground hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
      <div><h1 className="text-2xl font-bold text-foreground">Set up departments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Add the departments in this organization before importing employees.</p></div>
    </div>
    <p className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">Start with department names. Assign department heads once the people are available. A department used in several branches only needs to be added once.</p>
    {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading existing departments…</p>}
    {loadError && <div role="alert" className="rounded-xl border border-danger/50 bg-danger-subtle p-4 text-sm text-danger">{loadError} <Button variant="ghost" type="button" onClick={() => setReload(n => n + 1)} className="ml-2 underline h-auto whitespace-normal">Retry loading</Button></div>}
    {departments && <details className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">{departments.length} existing department{departments.length === 1 ? "" : "s"}</summary>
      <ul className="mt-3 flex flex-wrap gap-2">{departments.map(row => <li key={row.id} className="rounded-full bg-muted px-3 py-1 text-sm">{row.name}</li>)}</ul>
      {!departments.length && <p className="mt-2 text-sm text-muted-foreground">Add your first departments below.</p>}
    </details>}
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">1. Add department names</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Department workbook" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} />
          <Button variant="ghost" type="button" disabled={reading} onClick={() => fileInput.current?.click()} className={`${secondaryClass} h-auto whitespace-normal`}>{reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Read from employee workbook</Button>
          <span className="text-sm text-muted-foreground">Or paste one name per line below.</span>
        </div>
        <p className="text-xs text-muted-foreground">The workbook is read on this device. Only the department names you select are saved.</p>
        {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
        {workbook && <div className="space-y-3 rounded-lg border border-border bg-muted p-3">
          <p className="break-all text-sm font-medium">{fileName}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">Worksheet<NativeSelect aria-label="Worksheet" value={sheet} onChange={e => chooseSheet(workbook, e.target.value)} className={inputClass}>{workbook.SheetNames.map(name => <option key={name}>{name}</option>)}</NativeSelect></label>
            <label className="space-y-1 text-sm">Header row<NativeSelect aria-label="Header row" value={header} onChange={e => chooseHeader(Number(e.target.value))} className={inputClass}>{rows.slice(0, 20).map((_, i) => <option key={i} value={i}>Excel row {excelRow(i)}</option>)}</NativeSelect></label>
            <label className="space-y-1 text-sm">Department column<NativeSelect aria-label="Department column" value={column} onChange={e => setColumn(Number(e.target.value))} className={inputClass}><option value={-1}>Choose column</option>{(rows[header] ?? []).map((value, i) => <option key={i} value={i}>{excelCol(i)} · {String(value || "Untitled")}</option>)}</NativeSelect></label>
          </div>
          <SheetPreview rows={rows} header={header} column={column} excelRow={excelRow} excelCol={excelCol}
            onPickHeader={chooseHeader} onPickColumn={setColumn} />
          {column < 0
            ? <p role="status" className="text-xs font-medium text-warning">No column headed “Department” was found in Excel row {excelRow(header)}. Click the department column’s letter or heading in the preview, or choose another header row.</p>
            : (() => {
              const summary = columnSummary(rows, header, column);
              return summary.count === 0
                ? <p role="status" className="text-xs font-medium text-warning">Column {excelCol(column)} has no values below Excel row {excelRow(header)}.</p>
                : <p role="status" className="text-xs text-foreground">
                  <span className="font-semibold">{summary.count}</span> value{summary.count === 1 ? "" : "s"} in column {excelCol(column)} ({summary.distinct} different), Excel rows {excelRow(summary.first)}–{excelRow(summary.last)}.
                  {" "}First: {namesFromColumn(rows, header, column).slice(0, 4).join(" · ")}
                </p>;
            })()}
          {(() => {
            const warnings = column >= 0 ? departmentColumnWarnings(rows, header, column) : [];
            const empty = column < 0 || !namesFromColumn(rows, header, column).length;
            return <>
              {warnings.length > 0 && <div role="alert" className="rounded-lg border border-warning/50 bg-warning-subtle p-3 text-xs text-warning">
                <p className="font-semibold">Column {excelCol(column)} may not hold department names:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                <p className="mt-1">Check the preview. If you are sure, you can still add it.</p>
              </div>}
              <Button variant="ghost" type="button" disabled={empty} onClick={addColumn}
                className={`${warnings.length ? "inline-flex items-center justify-center gap-2 rounded-lg border border-warning bg-card px-4 py-2 text-sm font-medium text-warning hover:bg-warning-subtle disabled:opacity-50" : secondaryClass} h-auto whitespace-normal`}>
                {warnings.length ? `Add column ${excelCol(column)} anyway` : "Add this column to the list"}
              </Button>
            </>;
          })()}
          {added && <p role="status" className="text-xs text-success">
            Added {added.values} value{added.values === 1 ? "" : "s"} from column {added.column} ({added.distinct} different):
            {" "}<span className="font-semibold">{added.created} new and selected</span> · {added.existing} already exist · {added.attention} need attention.
            {" "}Review them below.
          </p>}
        </div>}
        <label className="block space-y-2 text-sm font-medium" htmlFor="department-names"><span>Department names</span><Textarea id="department-names" value={text} onChange={e => editText(e.target.value)} rows={7} placeholder={"Administration\nProduction\nQuality"} className={`${inputClass} font-normal`} /></label>
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">2. Review and create</h2>
        {!departments ? <p className="text-sm text-muted-foreground">Load the existing departments before reviewing new ones.</p> : <>
          {!review.length ? <p className="text-sm text-muted-foreground">Add names above to see what will be created.</p> : <>
            <p className="text-sm text-muted-foreground">{missing.length} new · {review.filter(row => row.status === "existing").length} already exist · {invalid.length} need attention</p>
            <p className="text-xs text-muted-foreground">Repeated names are combined. Check spelling before creating; similar names are kept separate.</p>
            {missing.length > 0 && <div className="flex flex-wrap gap-3 text-sm"><Button variant="ghost" type="button" className="font-medium text-primary underline h-auto whitespace-normal" onClick={() => setUnchecked(new Set())}>Select all new</Button><Button variant="ghost" type="button" className="text-muted-foreground underline h-auto whitespace-normal" onClick={() => setUnchecked(new Set(missing.map(row => row.key)))}>Clear selection</Button></div>}
            <ul className="max-h-96 divide-y divide-border overflow-auto rounded-lg border border-border">
              {review.map(row => <li key={row.key} className="flex items-start gap-3 p-3">
                {row.status === "new" ? <Checkbox className="mt-1 shrink-0" aria-label={`Create ${row.name}`} checked={!unchecked.has(row.key)} onCheckedChange={(checked) => setUnchecked(old => { const next = new Set(old); if (checked) next.delete(row.key); else next.add(row.key); return next; })} /> : row.status === "existing" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <span className="font-bold text-warning" aria-hidden="true">!</span>}
                <div className="min-w-0"><p className="break-words text-sm font-medium text-foreground">{row.name}{row.occurrences > 1 && <span className="ml-2 font-normal text-muted-foreground">×{row.occurrences}</span>}</p><p className={`text-xs ${row.status === "invalid" || row.status === "ambiguous" ? "text-warning" : "text-muted-foreground"}`}>{row.detail}</p></div>
              </li>)}
            </ul>
            {invalid.length > 0 && <p className="text-sm text-warning">Entries needing attention will not be created. Correct those names in your employee workbook before importing affected employees.</p>}
            {selected.length > MAX_SETUP_NAMES && <p role="alert" className="text-sm text-danger">Select at most 100 new departments at a time.</p>}
            <Button variant="ghost" type="button" disabled={busy || reading || selected.length === 0 || selected.length > MAX_SETUP_NAMES} onClick={() => void createSelected()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary disabled:opacity-50 h-auto whitespace-normal">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}{busy ? "Creating departments…" : `Create ${selected.length} selected department${selected.length === 1 ? "" : "s"}`}</Button>
          </>}
        </>}
      </section>
    </fieldset>
    <div ref={results} tabIndex={-1} className="scroll-mt-28 rounded-lg focus-visible:outline-ring">
      {saveError && <p role="alert" className="rounded-xl border border-danger/50 bg-danger-subtle p-4 text-sm text-danger">{saveError}</p>}
      {saved && <p role="status" className="rounded-xl border border-success/50 bg-success-subtle p-4 text-sm text-success">Saved: {saved.created.length} created{saved.existing.length ? `; ${saved.existing.length} already existed and were reused` : ""}. Selected departments are available for employee import.</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">Employee import and HOD assignment are separate steps.</p>
      {busy ? <span className="text-sm text-muted-foreground">Finishing department setup…</span> : <Link href="/ems/onboarding/new" className={secondaryClass}>Continue to employee import →</Link>}
    </div>
  </div>;
}

/**
 * A small view of the worksheet around the header row, with real Excel row numbers and column letters.
 * The header row and chosen column are highlighted; clicking a row number makes it the header row,
 * and clicking a column letter or heading makes it the department column.
 */
function SheetPreview({ rows, header, column, excelRow, excelCol, onPickHeader, onPickColumn }: {
  rows: unknown[][]; header: number; column: number;
  excelRow: (i: number) => number; excelCol: (c: number) => string;
  onPickHeader: (row: number) => void; onPickColumn: (col: number) => void;
}) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">This worksheet is empty.</p>;
  const start = Math.max(0, header - 1);                       // one row above the header, for context
  const shown = rows.slice(start, Math.min(rows.length, header + 9)).map((row, k) => ({ i: start + k, row }));
  const width = Math.min(40, Math.max(1, ...shown.map(({ row }) => row.length)));
  const cols = Array.from({ length: width }, (_, c) => c);
  const cell = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-border bg-card" aria-label="Worksheet preview">
      <Table className="border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-muted">
          <tr>
            <th className="sticky left-0 z-20 border border-border bg-muted px-2 py-1 text-muted-foreground">Row</th>
            {cols.map((c) => (
              <th key={c} className={`border border-border px-2 py-1 ${c === column ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
                <Button variant="ghost" type="button" onClick={() => onPickColumn(c)} className="w-full font-semibold hover:underline h-auto whitespace-normal" aria-label={`Use column ${excelCol(c)} for departments`}>
                  {excelCol(c)}
                </Button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map(({ i, row }) => {
            const isHeader = i === header;
            return (
              <tr key={i} className={isHeader ? "bg-primary/10 font-semibold" : ""}>
                <th className={`sticky left-0 border border-border px-2 py-1 text-right ${isHeader ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  <Button variant="ghost" type="button" onClick={() => onPickHeader(i)} className="hover:underline h-auto whitespace-normal" aria-label={`Use Excel row ${excelRow(i)} as the header row`}>
                    {excelRow(i)}
                  </Button>
                </th>
                {cols.map((c) => {
                  const text = cell(row[c]);
                  const inColumn = c === column;
                  return (
                    <td key={c} title={text} className={`max-w-[12rem] truncate border border-border px-2 py-1 ${
                      inColumn && isHeader ? "bg-primary/60 text-primary" : inColumn ? "bg-primary/10 text-foreground" : "text-foreground"}`}>
                      {isHeader && text
                        ? <Button variant="ghost" type="button" onClick={() => onPickColumn(c)} className="max-w-full truncate hover:underline h-auto">{text}</Button>
                        : text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="sticky left-0 border-t border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground">
        Showing Excel rows {excelRow(shown[0].i)}–{excelRow(shown[shown.length - 1].i)}{width === 40 ? ", first 40 columns" : ""}.
        Click a row number to use it as the header row; click a column letter or heading to choose the department column.
      </p>
    </div>
  );
}
