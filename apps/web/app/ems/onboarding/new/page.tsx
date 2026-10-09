"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { EmsService, UpdateOnboardingRecordPayload } from "@/services/ems.service";
import { ArrowLeft, Loader2, Upload, AlertCircle, FileSpreadsheet } from "lucide-react";
import { mapHeaders, findHeaderRow, scoreHeaderRow, MAPPABLE_FIELDS, Field } from "../column-map";
import TemplateCard from "./TemplateCard";

type ParsedRow = UpdateOnboardingRecordPayload & { rowNumber: number };

/** How many rows to offer when picking the header manually. */
const HEADER_SEARCH_DEPTH = 20;

export default function NewOnboardingImportPage() {
  const { accessToken } = useAuthStore();
  const router = useRouter();

  const [label, setLabel] = useState("");
  const [fileName, setFileName] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [grid, setGrid] = useState<unknown[][]>([]);
  const [headerIndex, setHeaderIndex] = useState(-1);
  const [pickingHeader, setPickingHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState<(Field | null)[]>([]);

  /** Read a sheet into a grid and guess where its headers are. */
  function loadSheet(wb: XLSX.WorkBook, name: string) {
    const sheet = wb.Sheets[name];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    });

    setGrid(rows);
    setPickingHeader(false);

    if (rows.length === 0) {
      setHeaderIndex(-1);
      setError("That sheet is empty.");
      return;
    }

    const found = findHeaderRow(rows, HEADER_SEARCH_DEPTH);
    setHeaderIndex(found);
    setMapping(found >= 0 ? mapHeaders(rows[found]) : []);
    setError(
      found === -1
        ? "Couldn't find a header row — pick one below, or check the column names."
        : null,
    );
  }

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    if (!label) setLabel(file.name.replace(/\.[^.]+$/, ""));

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      setWorkbook(wb);

      const first = wb.SheetNames[0];
      setSheetName(first);
      loadSheet(wb, first);
    } catch (e: any) {
      setWorkbook(null);
      setGrid([]);
      setHeaderIndex(-1);
      setError(e.message || "Could not read that file.");
    }
  }

  // Everything below is derived from the grid and the chosen header row.
  const headerRow = headerIndex >= 0 ? grid[headerIndex] : [];
  const fields = mapping;

  const unmatched =
    headerIndex >= 0
      ? headerRow
          .map((cell, i) => (fields[i] ? null : String(cell ?? "").trim()))
          .filter((v): v is string => !!v)
      : [];

  const rows: ParsedRow[] = (() => {
    if (headerIndex < 0) return [];
    const out: ParsedRow[] = [];

    for (let i = headerIndex + 1; i < grid.length; i++) {
      const record: ParsedRow = { rowNumber: i + 1 };
      let hasValue = false;

      fields.forEach((field, col) => {
        if (!field) return;
        const text = String(grid[i][col] ?? "").trim();
        if (text) {
          record[field] = text;
          hasValue = true;
        }
      });

      if (hasValue) out.push(record);
    }
    return out;
  })();

  async function handleUpload() {
    if (!accessToken || rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const batch = await EmsService.createOnboardingBatch(
        { label: label || fileName, sourceFileName: fileName },
        accessToken,
      );
      await EmsService.addOnboardingRecords(batch.id, { records: rows }, accessToken);
      await EmsService.validateOnboardingBatch(batch.id, accessToken);
      router.push(`/ems/onboarding/${batch.id}`);
    } catch (e: any) {
      setError(e.message || "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5 max-w-4xl">

        <div className="flex items-center gap-3">
          <Link href="/ems/onboarding" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">New import</h1>
            <p className="text-sm text-slate-500">Upload a spreadsheet of employees to review before registering</p>
          </div>
        </div>

        <TemplateCard />

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Nairobi plant, January intake"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Spreadsheet</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="mt-1 w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-semibold"
            />
          </label>

          {/* Sheet picker — only when the workbook has more than one */}
          {workbook && workbook.SheetNames.length > 1 && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sheet</span>
              <select
                value={sheetName}
                onChange={(e) => {
                  setSheetName(e.target.value);
                  loadSheet(workbook, e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {workbook.SheetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Which row is being read as headers */}
          {grid.length > 0 && (
            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-300" />
              {headerIndex >= 0 ? (
                <>
                  Reading column names from <span className="font-semibold text-slate-700">row {headerIndex + 1}</span>
                  <span className="text-slate-300">·</span>
                  <span>{fields.filter(Boolean).length} columns matched</span>
                </>
              ) : (
                <>No header row found</>
              )}
              <button
                onClick={() => setPickingHeader((v) => !v)}
                className="font-medium text-blue-600 hover:text-blue-700"
              >
                {pickingHeader ? "Done" : "Change"}
              </button>
            </div>
          )}

          {/* Manual header picker */}
          {pickingHeader && grid.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <p className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border-b border-slate-100">
                Click the row that holds your column names
              </p>
              <div className="max-h-64 overflow-auto">
                {grid.slice(0, HEADER_SEARCH_DEPTH).map((row, i) => {
                  const matches = scoreHeaderRow(row);
                  const chosen = i === headerIndex;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setHeaderIndex(i);
                        setMapping(mapHeaders(row));
                        setPickingHeader(false);
                        setError(null);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs border-b border-slate-50 flex items-start gap-2 hover:bg-slate-50 ${
                        chosen ? "bg-blue-50" : ""
                      }`}
                    >
                      <span className="text-slate-300 w-6 shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate text-slate-600">
                        {row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" · ") || "(empty)"}
                      </span>
                      {matches > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold text-emerald-600">
                          {matches} match{matches === 1 ? "" : "es"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Ignored columns: {unmatched.join(", ")}
              {headerIndex >= 0 && headerRow.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                      Match your columns to the fields they hold
                    </p>
                    <p className="text-xs text-slate-400">
                      {fields.filter(Boolean).length} of {headerRow.length} mapped
                    </p>
                  </div>
                  <div className="max-h-72 overflow-auto divide-y divide-slate-50">
                    {headerRow.map((cell, col) => {
                      const name = String(cell ?? "").trim();
                      if (!name) return null;

                      const sample = grid
                        .slice(headerIndex + 1, headerIndex + 6)
                        .map((r) => String(r[col] ?? "").trim())
                        .find(Boolean);

                      // A field already taken by another column
                      const takenElsewhere = (key: Field) =>
                        fields.some((f, i) => f === key && i !== col);

                      return (
                        <div key={col} className="px-3 py-2 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">{name}</p>
                            {sample && (
                              <p className="text-[11px] text-slate-400 truncate">e.g. {sample}</p>
                            )}
                          </div>
                          <select
                            value={fields[col] ?? ""}
                            onChange={(e) => {
                              const value = (e.target.value || null) as Field | null;
                              setMapping((prev) => {
                                const next = [...prev];
                                // A field can only be used once — clear any other column holding it
                                if (value) {
                                  for (let i = 0; i < next.length; i++) {
                                    if (next[i] === value) next[i] = null;
                                  }
                                }
                                next[col] = value;
                                return next;
                              });
                            }}
                            className={`shrink-0 w-56 px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                              fields[col] ? "border-slate-200 text-slate-700" : "border-slate-100 text-slate-400"
                            }`}
                          >
                            <option value="">— ignore this column —</option>
                            {MAPPABLE_FIELDS.map(({ key, label }) => (
                              <option key={key} value={key} disabled={takenElsewhere(key)}>
                                {label}{takenElsewhere(key) ? " (already used)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
                </div>
              )}

          {rows.length > 0 && (
            <>
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{rows.length}</span> rows ready to import
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left px-3 py-2 font-semibold">Row</th>
                      <th className="text-left px-3 py-2 font-semibold">Code</th>
                      <th className="text-left px-3 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{r.employeeCode ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{r.currentDepartment ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && (
                  <p className="px-3 py-2 text-xs text-slate-400 bg-slate-50">
                    …and {rows.length - 5} more
                  </p>
                )}
              </div>

              <button
                onClick={handleUpload}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Import {rows.length} rows
              </button>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}







{/*"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { EmsService, UpdateOnboardingRecordPayload } from "@/services/ems.service";
import { ArrowLeft, Loader2, Upload, AlertCircle } from "lucide-react";
import { mapHeaders } from "../column-map";

type ParsedRow = UpdateOnboardingRecordPayload & { rowNumber: number };

export default function NewOnboardingImportPage() {
  const { accessToken } = useAuthStore();
  const router = useRouter();

  const [label, setLabel] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setRows([]);
    setUnmatched([]);
    setFileName(file.name);
    if (!label) setLabel(file.name.replace(/\.[^.]+$/, ""));

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

      if (grid.length < 2) {
        setError("That file has no data rows.");
        return;
      }

      const headerRow = grid[0];
      const fields = mapHeaders(headerRow);

      const missed = headerRow
        .map((cell, i) => (fields[i] ? null : String(cell ?? "").trim()))
        .filter((v): v is string => !!v);
      setUnmatched(missed);

      const parsed: ParsedRow[] = [];
      for (let i = 1; i < grid.length; i++) {
        const row = grid[i];
        const record: ParsedRow = { rowNumber: i + 1 };
        let hasValue = false;

        fields.forEach((field, col) => {
          if (!field) return;
          const raw = row[col];
          const text = String(raw ?? "").trim();
          if (text) {
            record[field] = text;
            hasValue = true;
          }
        });

        if (hasValue) parsed.push(record);
      }

      if (parsed.length === 0) setError("No usable rows found — check the column headings.");
      setRows(parsed);
    } catch (e: any) {
      setError(e.message || "Could not read that file.");
    }
  }

  async function handleUpload() {
    if (!accessToken || rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const batch = await EmsService.createOnboardingBatch(
        { label: label || fileName, sourceFileName: fileName },
        accessToken,
      );
      await EmsService.addOnboardingRecords(batch.id, { records: rows }, accessToken);
      await EmsService.validateOnboardingBatch(batch.id, accessToken);
      router.push(`/ems/onboarding/${batch.id}`);
    } catch (e: any) {
      setError(e.message || "Upload failed.");
      setBusy(false);
    }
  }

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.HR]}>
      <div className="space-y-5 max-w-3xl">

        <div className="flex items-center gap-3">
          <Link href="/ems/onboarding" className="text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">New import</h1>
            <p className="text-sm text-slate-500">Upload a spreadsheet of employees to review before registering</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Nairobi plant, January intake"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Spreadsheet</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="mt-1 w-full text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:text-xs file:font-semibold"
            />
          </label>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {unmatched.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Ignored columns: {unmatched.join(", ")}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{rows.length}</span> rows ready to import
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left px-3 py-2 font-semibold">Row</th>
                      <th className="text-left px-3 py-2 font-semibold">Code</th>
                      <th className="text-left px-3 py-2 font-semibold">Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{r.employeeCode ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{r.currentDepartment ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && (
                  <p className="px-3 py-2 text-xs text-slate-400 bg-slate-50">
                    …and {rows.length - 5} more
                  </p>
                )}
              </div>

              <button
                onClick={handleUpload}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Import {rows.length} rows
              </button>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
  */}


  