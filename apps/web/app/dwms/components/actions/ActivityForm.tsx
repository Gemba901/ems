"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  PlusCircle,
  Upload,
} from "lucide-react";
import {
  ActivityScope,
  DwmsService,
  getDwmsErrorMessage,
  type CreateActivityPayload,
  type DwmsActivityItem,
  type DwmsDepartmentOption,
  type DwmsFrequency,
  type IngestActivityRowPayload,
} from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import DwmsSelectDropdown from "../DwmsSelectDropdown";

const FREQUENCIES: DwmsFrequency[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
];

const EMPTY_FORM: CreateActivityPayload = {
  name: "",
  workMethod: "",
  code: "",
  completionDeadline: 0,
  frequency: "DAILY",
  completionOutput: "",
  scope: ActivityScope.ORGANISATION,
  scopeTarget: "",
  parentActivityIds: [],
  evidenceRequired: "",
  gembaSection: "",
  processArea: "",
  remarks: "",
};

type ActivityFormProps = {
  onCreated?: () => void;
};

type ParsedActivitySheet = {
  sheetName: string;
  rows: string[][];
};

type ParsedActivityRow = {
  rowNumber: number;
  sourceRowNumber: number;
  sheetName: string;
  headers: string[];
  values: string[];
  row: Record<string, string>;
};

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s/_-]+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const PROCESS_NAME_HEADERS = ["Process Name", "Activity Name", "Name"];
const DESCRIPTION_HEADERS = ["Description / SOP", "Description", "SOP"];

function hasAnyHeader(row: string[], aliases: string[]) {
  const normalizedCells = new Set(row.map(normalizeHeader).filter(Boolean));
  return aliases.some((alias) => normalizedCells.has(normalizeHeader(alias)));
}

function findActivityHeaderRowIndex(rows: string[][]) {
  return rows.findIndex(
    (row) =>
      hasAnyHeader(row, PROCESS_NAME_HEADERS) &&
      hasAnyHeader(row, DESCRIPTION_HEADERS),
  );
}

function csvEscape(value: string) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows: string[][]) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseDelimited(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;
  const delimiter = text.includes("\t") ? "\t" : ",";

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function isExcelFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

async function parseActivitySheets(file: File): Promise<ParsedActivitySheet[]> {
  if (!isExcelFile(file)) {
    return [{ sheetName: file.name, rows: parseDelimited(await file.text()) }];
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = sheet
      ? XLSX.utils
          .sheet_to_json<unknown[]>(sheet, {
            header: 1,
            defval: "",
            raw: true,
          })
          .map((row) => row.map(cellToText))
          .filter((row) => row.some(Boolean))
      : [];
    return { sheetName, rows };
  }).filter((sheet) => sheet.rows.length > 0);
}

function parseEstimatedHours(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

const ACTIVITY_TEMPLATE_CSV = rowsToCsv([
  [
    "Scope of Activity",
    "Target",
    "Activity Code",
    "Process Name",
    "Description / SOP",
    "Frequency",
    "Estimated Time (Hours)",
    "Expected Output",
    "Remarks",
    "Documents Required",
    "Gemba Section",
    "Process Area",
    "Parent Activity Code",
  ],
  [
    "Organisation",
    "NA",
    "ORG-001",
    "Daily workplace check",
    "Follow the approved workplace checklist",
    "DAILY",
    "0.5",
    "Completed checklist",
    "Report abnormalities immediately",
    "NA",
    "NA",
    "NA",
    "NA",
  ],
  [
    "Department",
    "Production",
    "DEP-001",
    "Shift handover",
    "Complete the handover checklist",
    "DAILY",
    "0.25",
    "Signed handover",
    "Escalate open issues",
    "Handover sheet",
    "NA",
    "Shop floor",
    "NA",
  ],
  [
    "Job Title",
    "Shift Supervisor",
    "JOB-001",
    "Team review",
    "Review team output and blockers",
    "WEEKLY",
    "1",
    "Review notes",
    "Record actions",
    "NA",
    "NA",
    "Operations",
    "NA",
  ],
  [
    "Employee",
    "EMP-001",
    "EMP-ACT-001",
    "Machine inspection",
    "Inspect the assigned machine",
    "DAILY",
    "0.5",
    "Inspection recorded",
    "Use the approved checklist",
    "Inspection checklist",
    "Line 1",
    "Maintenance",
    "NA",
  ],
]);

function parseScope(value: string): ActivityScope | undefined {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  if (normalized === "organisation") return ActivityScope.ORGANISATION;
  if (normalized === "department") return ActivityScope.DEPARTMENT;
  if (normalized === "job title") return ActivityScope.JOB_TITLE;
  if (normalized === "employee") return ActivityScope.EMPLOYEE;
  return undefined;
}
function firstValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return "";
}

function optionalValue(row: Record<string, string>, keys: string[]) {
  const value = firstValue(row, keys);
  return /^(na|n\/a)$/i.test(value.trim()) ? "" : value;
}

function cleanPayload(payload: CreateActivityPayload): CreateActivityPayload {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    cleaned[key] =
      typeof value === "string" && value.trim() === "" ? undefined : value;
  }
  return cleaned as unknown as CreateActivityPayload;
}

export default function ActivityForm({ onCreated }: ActivityFormProps) {
  const { accessToken, user } = useAuthStore();
  const [form, setForm] = useState<CreateActivityPayload>(EMPTY_FORM);
  const [departments, setDepartments] = useState<DwmsDepartmentOption[]>([]);
  const [activities, setActivities] = useState<DwmsActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [queuedIngestionId, setQueuedIngestionId] = useState<string | null>(
    null,
  );
  const canManageActivities = [
    "MANAGEMENT",
    "SUPER_ADMIN",
    "ADMIN",
    "HR",
    "HOD",
  ].includes(String(user?.roleLevel ?? "").toUpperCase());

  useEffect(() => {
    let mounted = true;
    async function loadLookups() {
      if (!accessToken) return;
      const [departmentList, activityList] = await Promise.all([
        DwmsService.getDepartments(accessToken).catch(() => []),
        DwmsService.getActivities(accessToken).catch(() => ({
          activities: [],
        })),
      ]);
      if (mounted) {
        setDepartments(departmentList);
        setActivities(activityList.activities ?? []);
      }
    }
    void loadLookups();
    return () => {
      mounted = false;
    };
  }, [accessToken]);

  const departmentOptions = useMemo(
    () =>
      departments.map((department) => ({
        value: department.name,
        label: department.name,
      })),
    [departments],
  );

  const parentActivityOptions = useMemo(
    () =>
      activities
        .filter(
          (activity) =>
            activity.status !== "ARCHIVED" &&
            activity.frequency === form.frequency,
        )
        .map((activity) => ({
          value: activity.id,
          label: activity.name,
          secondaryLabel: [activity.code, activity.frequency]
            .filter(Boolean)
            .join(" | "),
        })),
    [activities, form.frequency],
  );

  function setField<K extends keyof CreateActivityPayload>(
    key: K,
    value: CreateActivityPayload[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage(null);
  }

  async function submitActivity(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setLoading(true);
    setMessage(null);
    try {
      await DwmsService.createActivity(accessToken, cleanPayload(form));
      setForm({ ...EMPTY_FORM });
      setMessage("Activity created successfully.");
      onCreated?.();
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to create activity"));
    } finally {
      setLoading(false);
    }
  }

  function rowToPayload(row: Record<string, string>): CreateActivityPayload {
    const rawFrequency = firstValue(row, ["Frequency"]).toUpperCase();
    const scope = parseScope(firstValue(row, ["Scope of Activity"]));

    return cleanPayload({
      name: firstValue(row, PROCESS_NAME_HEADERS),
      workMethod: firstValue(row, DESCRIPTION_HEADERS),
      code: firstValue(row, ["Activity Code", "Code"]),
      completionDeadline:
        parseEstimatedHours(
          firstValue(row, ["Estimated Time (Hours)", "Estimated Time"]),
        ) ?? Number.NaN,
      frequency: rawFrequency,
      completionOutput: firstValue(row, ["Expected Output"]),
      scope: scope as ActivityScope,
      scopeTarget: firstValue(row, ["Target"]),
      evidenceRequired: optionalValue(row, ["Documents Required", "Documents"]),
      gembaSection: optionalValue(row, ["Gemba Section"]),
      processArea: optionalValue(row, ["Process Area"]),
      remarks: firstValue(row, ["Remarks"]),
    });
  }

  function rowToIngestPayload(
    row: Record<string, string>,
    rowNumber: number,
  ): IngestActivityRowPayload {
    return {
      rowNumber,
      parentActivityCode: firstValue(row, ["Parent Activity Code"]),
      activity: rowToPayload(row),
    };
  }

  async function importFile(file: File) {
    if (!accessToken) return;
    setImporting(true);
    setMessage(null);
    setQueuedIngestionId(null);
    try {
      const sheets = await parseActivitySheets(file);
      if (sheets.length === 0) {
        throw new Error("No activity rows found in the file.");
      }

      const parsedRows: ParsedActivityRow[] = [];
      const skippedSheets: string[] = [];
      let importRowNumber = 1;

      for (const sheet of sheets) {
        const headerIndex = findActivityHeaderRowIndex(sheet.rows);
        if (headerIndex === -1) {
          skippedSheets.push(sheet.sheetName);
          continue;
        }

        const headers = sheet.rows[headerIndex];
        const dataRows = sheet.rows.slice(headerIndex + 1);
        if (!headers || dataRows.length === 0) continue;

        const normalizedHeaders = headers.map(normalizeHeader);
        for (const [index, row] of dataRows.entries()) {
          parsedRows.push({
            rowNumber: importRowNumber,
            sourceRowNumber: headerIndex + index + 2,
            sheetName: sheet.sheetName,
            headers,
            values: row,
            row: Object.fromEntries(
              normalizedHeaders.map((header, columnIndex) => [
                header,
                row[columnIndex] ?? "",
              ]),
            ),
          });
          importRowNumber += 1;
        }
      }

      if (parsedRows.length === 0) {
        throw new Error(
          skippedSheets.length > 0
            ? "Could not find activity headers in any worksheet. Include Process Name and Description / SOP columns."
            : "No activity rows found in the file.",
        );
      }

      const payloads = parsedRows.map(({ row, rowNumber }) =>
        rowToIngestPayload(row, rowNumber),
      );
      const result = await DwmsService.ingestActivities(
        accessToken,
        payloads,
        file.name,
      );
      setQueuedIngestionId(result.ingestion?.id ?? null);
      setMessage(
        result.ingestion?.id
          ? `Queued ${payloads.length} activity rows for background import.`
          : result.message,
      );
    } catch (error) {
      setQueuedIngestionId(null);
      setMessage(getDwmsErrorMessage(error, "Failed to queue activities"));
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {!canManageActivities ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:p-6 lg:col-span-12">
          Activity creation is available to Management, Admin, Super Admin, HR,
          and HOD users.
        </div>
      ) : (
        <form
          onSubmit={submitActivity}
          className="space-y-6 rounded-2xl border border-border-app bg-white p-4 shadow-sm sm:p-6 lg:col-span-8"
        >
          {message && (
            <div
              className={`space-y-3 rounded-xl border p-4 text-xs ${queuedIngestionId || message.includes("success") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
            >
              <p>{message}</p>
              {queuedIngestionId && (
                <Link
                  href={`/dwms/activities/ingestions/${queuedIngestionId}`}
                  className="inline-flex rounded-lg border border-emerald-200 bg-white px-3 py-2 font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  View ingestion status
                </Link>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <SelectField
              label="Scope of Activity"
              required
              value={form.scope}
              options={Object.values(ActivityScope).map((value) => ({
                value,
                label: value.replaceAll("_", " "),
              }))}
              placeholder="Choose scope"
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  scope: value as ActivityScope,
                  scopeTarget: "",
                  parentActivityIds: [],
                }))
              }
            />
            {form.scope === ActivityScope.DEPARTMENT ? (
              <SelectField
                label="Target"
                required
                value={form.scopeTarget ?? ""}
                options={departmentOptions}
                placeholder="Choose department"
                onChange={(value) => setField("scopeTarget", value)}
              />
            ) : form.scope === ActivityScope.ORGANISATION ? (
              <div />
            ) : (
              <TextField
                label="Target"
                required
                placeholder={
                  form.scope === ActivityScope.EMPLOYEE
                    ? "Employee ID"
                    : "Exact job title"
                }
                value={form.scopeTarget ?? ""}
                onChange={(value) => setField("scopeTarget", value)}
              />
            )}
            <TextField
              label="Process Name"
              placeholder="Daily line startup inspection"
              required
              value={form.name}
              onChange={(value) => setField("name", value)}
            />
            <TextField
              label="Activity Code"
              required
              placeholder="PROD-001"
              value={form.code}
              onChange={(value) => setField("code", value)}
            />
            <TextField
              label="Estimated Time (Hours)"
              required
              type="number"
              min={0}
              step={0.01}
              placeholder="2"
              value={form.completionDeadline}
              onChange={(value) =>
                setField(
                  "completionDeadline",
                  value === "" ? 0 : Math.max(0, Number(value)),
                )
              }
            />
            <SelectField
              label="Frequency"
              required
              value={String(form.frequency)}
              options={FREQUENCIES.map((value) => ({
                value,
                label: value.replaceAll("_", " "),
              }))}
              placeholder="Select frequency"
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  frequency: value,
                  parentActivityIds: [],
                }))
              }
            />
            <TextField
              label="Expected Output"
              required
              placeholder="Checklist completed and abnormalities reported"
              value={form.completionOutput ?? ""}
              onChange={(value) => setField("completionOutput", value)}
            />
            <TextField
              label="Gemba Section"
              placeholder="Optional"
              value={form.gembaSection ?? ""}
              onChange={(value) => setField("gembaSection", value)}
            />
            <TextField
              label="Process Area"
              placeholder="Optional"
              value={form.processArea ?? ""}
              onChange={(value) => setField("processArea", value)}
            />
            <TextField
              label="Documents Required"
              placeholder="Startup checklist, SOP reference"
              value={form.evidenceRequired ?? ""}
              onChange={(value) => setField("evidenceRequired", value)}
            />
            {form.scope === ActivityScope.EMPLOYEE && (
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
                  Parent Activity
                </span>
                <DwmsSelectDropdown
                  value={form.parentActivityIds?.[0] ?? ""}
                  options={parentActivityOptions}
                  placeholder="Select prerequisite activity"
                  searchEnabled
                  allowClear
                  emptyMessage="No same-frequency activities found."
                  onChange={(value) =>
                    setField("parentActivityIds", value ? [value] : [])
                  }
                  triggerClassName="h-auto rounded-xl border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
                />
              </label>
            )}
          </div>

          <TextArea
            label="Description / SOP"
            required
            placeholder="Describe the exact steps, SOP, or standard method to follow."
            value={form.workMethod ?? ""}
            onChange={(value) => setField("workMethod", value)}
          />
          <TextArea
            label="Remarks"
            required
            placeholder="Add required operational remarks."
            value={form.remarks}
            onChange={(value) => setField("remarks", value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-4 text-sm font-semibold text-text-app shadow-sm transition hover:bg-zinc-50 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            <span>{loading ? "Creating..." : "Create activity"}</span>
          </button>
        </form>
      )}

      {canManageActivities && (
        <aside className="space-y-4 rounded-2xl border border-border-app bg-white p-4 shadow-sm sm:p-6 lg:col-span-4">
          <div className="flex items-center gap-3 border-b border-border-app pb-4">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-sm font-bold text-text-app">
                Import activities
              </h2>
              <p className="text-xs text-muted-app">
                Upload an XLSX, XLS, CSV, or TSV with recurring activity
                columns.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              downloadTextFile(
                "dwms-activity-template.csv",
                ACTIVITY_TEMPLATE_CSV,
                "text/csv;charset=utf-8",
              )
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Download template
          </button>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 hover:bg-slate-100">
            <Upload className="h-5 w-5" />
            <span className="font-semibold">
              {importing ? "Importing..." : "Choose XLSX / CSV file"}
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/tab-separated-values"
              disabled={importing}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFile(file);
              }}
            />
          </label>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600">
            <div>
              <p className="font-bold text-slate-700">Workbook import</p>
              <p>
                XLSX and XLS imports read every worksheet in the workbook. Each
                worksheet should have its own header row; sheets without
                activity headers are skipped.
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-700">Required columns</p>
              <p>
                Scope of Activity, Target (except Organisation), Activity Code,
                Process Name, Description / SOP, Frequency, Estimated Time
                (Hours), Expected Output, and Remarks.
              </p>
            </div>
            <div>
              <p className="font-bold text-slate-700">Optional columns</p>
              <p>
                Documents Required, Gemba Section, Process Area, and Parent
                Activity Code (Employee scope only).
              </p>
            </div>
            <p>
              Scope of Activity must be Organisation, Department, Job Title, or
              Employee. Target contains a department name, exact job title, or
              employee ID; use blank or NA for Organisation. Frequency must be
              DAILY, WEEKLY, MONTHLY, QUARTERLY, or YEARLY.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  min,
  step,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        min={min}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <textarea
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-text-app shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  placeholder,
  onChange,
  required,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-app">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <DwmsSelectDropdown
        value={value}
        options={options}
        onChange={onChange}
        placeholder={placeholder}
        searchEnabled
        triggerClassName="h-auto rounded-xl border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
      />
    </label>
  );
}
