"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, X } from "lucide-react";

const TEMPLATE_URL = "/BEES%20onboarding%20staff-template.xlsx";

export default function TemplateCard() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState("");

  const rows = useMemo<unknown[][]>(() => {
    if (!workbook || !sheetName) return [];

    return XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[sheetName],
      { header: 1, defval: "" },
    );
  }, [workbook, sheetName]);

  async function openPreview() {
    setOpen(true);
    if (workbook) return; // Reuse the workbook if the preview is reopened.

    setLoading(true);
    setError("");

    try {
      const response = await fetch(TEMPLATE_URL);
      if (!response.ok) throw new Error("Could not load the template.");

      const parsed = XLSX.read(await response.arrayBuffer(), {
        type: "array",
      });

      if (parsed.SheetNames.length === 0) {
        throw new Error("The template has no sheets.");
      }

      setWorkbook(parsed);
      setSheetName(parsed.SheetNames[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={openPreview}
          className="flex w-full items-center gap-5 text-left"
          aria-label="Preview BEES onboarding staff template"
        >
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
            <FileSpreadsheet className="h-12 w-12 text-emerald-700" />
          </div>

          <div>
            <h2 className="font-semibold text-slate-900">
              BEES onboarding staff template
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Preview both sheets before filling in the template.
            </p>
            <span className="mt-2 inline-block text-sm font-medium text-blue-600">
              Preview template
            </span>
          </div>
        </button>

        <a
          href={TEMPLATE_URL}
          download
          className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Download XLSX template
        </a>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="BEES onboarding staff template preview"
        >
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-semibold text-slate-900">Template preview</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading template…
              </div>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : workbook ? (
              <>
                <label className="mb-3 block text-sm text-slate-600">
                  Sheet
                  <select
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                    className="ml-3 rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {workbook.SheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="min-h-0 overflow-auto rounded-lg border border-slate-200">
                  <table className="border-collapse text-xs">
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="min-w-28 whitespace-nowrap border border-slate-200 px-3 py-2"
                            >
                              {String(cell ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
