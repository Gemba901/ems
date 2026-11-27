"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Eye, Loader2, X } from "lucide-react";
import { CommunicationChannel } from "@/services/ems.service";
import { ALWAYS_REQUIRED_FIELDS, findHeaderRow, mapHeaders, MapField } from "../column-map";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Table } from "@/components/ui/table";

const TEMPLATE_URL = "/BEES%20onboarding%20staff-template.xlsx";

/** The template's colour key, matching the header colours in the Excel file. */
const KIND_STYLE = {
  required: { cell: "bg-[#1F3864] text-primary-foreground", chip: "bg-[#1F3864]", label: "Always required" },
  channel:  { cell: "bg-[#7030A0] text-primary-foreground", chip: "bg-[#7030A0]", label: "Required depending on your communication channel" },
  company:  { cell: "bg-[#ED7D31] text-primary-foreground", chip: "bg-[#ED7D31]", label: "Company Code: only if you use company codes" },
  optional: { cell: "bg-[#4472C4] text-primary-foreground", chip: "bg-[#4472C4]", label: "Optional" },
} as const;
type Kind = keyof typeof KIND_STYLE;

const CHANNEL_FIELDS: Record<CommunicationChannel, MapField> = { WHATSAPP: "whatsappNumber", EMAIL: "workEmail" };

/** How a template column is treated by the import, using the same rules as the import page. */
function kindOf(field: MapField | null): Kind | null {
  if (!field) return null;
  if (field === "fullName" || (ALWAYS_REQUIRED_FIELDS as string[]).includes(field)) return "required";
  if (field === "whatsappNumber" || field === "workEmail") return "channel";
  if (field === "companyCode") return "company";
  return "optional";
}

/** A small drawing of the template: coloured header cells over a few blank rows. */
function MiniSheet() {
  const header: Kind[] = ["company", "required", "required", "channel", "required", "optional", "optional"];
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-muted">
      {header.map((kind, i) => <div key={i} className={`h-2.5 ${KIND_STYLE[kind].chip}`} />)}
      {Array.from({ length: 21 }, (_, i) => <div key={`c${i}`} className="h-2 bg-card" />)}
    </div>
  );
}

export default function TemplateCard({ channel = null }: { channel?: CommunicationChannel | null }) {
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

  // Colour the header row the way the import will treat each column.
  const headerIndex = useMemo(() => (rows.length ? findHeaderRow(rows) : -1), [rows]);
  const headerKinds = useMemo(
    () => (headerIndex >= 0 ? mapHeaders(rows[headerIndex]).map(kindOf) : []),
    [rows, headerIndex],
  );
  const channelField = channel ? CHANNEL_FIELDS[channel] : null;

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
      {/* Sits beside the file area: shows what's expected, without competing with "Choose file". */}
      <div className="flex h-full flex-col gap-3 rounded-xl border border-success/30 bg-success-subtle/50 p-4">
        <Button variant="ghost"
          type="button"
          onClick={openPreview}
          className="group relative block rounded-lg bg-card p-1.5 shadow-sm ring-1 ring-border hover:ring-success h-auto whitespace-normal"
          aria-label="Preview BEES onboarding staff template"
        >
          <MiniSheet />
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-primary/0 text-xs font-semibold text-transparent transition group-hover:bg-primary/60 group-hover:text-primary-foreground">
            <Eye className="h-4 w-4" /> Preview
          </span>
        </Button>

        <div>
          <p className="text-sm font-semibold text-foreground">BEES onboarding template</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Use it so your columns match automatically. Coloured headers show which columns are required.
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-3">
          <Button variant="ghost" type="button" onClick={openPreview} className="text-xs font-medium text-info hover:text-info h-auto whitespace-normal">
            Preview
          </Button>
          <a
            href={TEMPLATE_URL}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-success/50 bg-card px-3 py-1.5 text-xs font-semibold text-success hover:bg-success-subtle"
          >
            <Download className="h-3.5 w-3.5" /> Download template
          </a>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          aria-label="BEES onboarding staff template preview"
          className="flex max-h-[90vh] w-full max-w-5xl flex-col gap-0 rounded-2xl bg-card p-5 ring-0 sm:max-w-5xl"
        >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-semibold text-foreground">Template preview</h2>
              <Button variant="ghost"
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
                className="rounded-lg p-2 hover:bg-muted h-auto whitespace-normal"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading template…
              </div>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : workbook ? (
              <>
                <label className="mb-3 block text-sm text-muted-foreground">
                  Sheet
                  <NativeSelect
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                    className="ml-3 rounded-lg border border-border px-3 py-2"
                  >
                    {workbook.SheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>

                {headerIndex >= 0 && (
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    {(Object.keys(KIND_STYLE) as Kind[]).map((kind) => (
                      <span key={kind} className="inline-flex items-center gap-1.5">
                        <span className={`h-3 w-3 rounded-sm ${KIND_STYLE[kind].chip}`} />
                        {KIND_STYLE[kind].label}
                        {kind === "channel" && channelField && (
                          <span className="font-semibold">
                            {" "}(yours: {channelField === "whatsappNumber" ? "WhatsApp number" : "Email"})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="min-h-0 overflow-auto rounded-lg border border-border">
                  <Table className="border-collapse text-xs">
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => {
                            const kind = rowIndex === headerIndex ? headerKinds[cellIndex] : null;
                            const isYourChannel =
                              kind === "channel" && channelField !== null &&
                              mapHeaders([cell])[0] === channelField;
                            return (
                              <td
                                key={cellIndex}
                                className={`min-w-28 whitespace-nowrap border border-border px-3 py-2 ${
                                  kind ? `${KIND_STYLE[kind].cell} font-semibold` : ""
                                }`}
                              >
                                {String(cell ?? "")}
                                {isYourChannel && <span className="ml-1">*</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </>
            ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
