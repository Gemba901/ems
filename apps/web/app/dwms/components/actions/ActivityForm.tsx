"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  PlusCircle,
  Upload,
} from "lucide-react";
import {
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
  "PLANNED",
];

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const EMPTY_FORM: CreateActivityPayload = {
  mainDepartmentId: "",
  subDepartment: "",
  name: "",
  workMethod: "",
  code: "",
  completionDeadline: null,
  purpose: "",
  frequency: "DAILY",
  completionOutput: "",
  primaryResponsibleDesignation: "",
  parentActivityIds: [],
  evidenceRequired: "",
  effectiveFrom: todayKey(),
};

type ActivityFormProps = {
  onCreated?: () => void;
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

function failedRowsFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "activity-import";
  return `${baseName}-failed-rows.csv`;
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

async function parseActivityRows(file: File) {
  if (!isExcelFile(file)) return parseDelimited(await file.text());

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) return [];

  return XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true })
    .map((row) => row.map(cellToText))
    .filter((row) => row.some(Boolean));
}

function parseEstimatedHours(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const match = raw.match(/\d+/);
  return match ? Number(match[0]) : null;
}
function firstValue(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[normalizeHeader(key)];
    if (value) return value;
  }
  return "";
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
  const [failedRowsCsv, setFailedRowsCsv] = useState<{
    fileName: string;
    content: string;
  } | null>(null);
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
        value: department.id,
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
      await DwmsService.createActivity(
        accessToken,
        cleanPayload({
          ...form,
          effectiveFrom: form.effectiveFrom || todayKey(),
        }),
      );
      setForm({ ...EMPTY_FORM, effectiveFrom: todayKey() });
      setMessage("Activity created successfully.");
      onCreated?.();
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to create activity"));
    } finally {
      setLoading(false);
    }
  }

  function findDepartmentId(value: string) {
    const normalized = value.trim().toLowerCase();
    return departments.find(
      (department) => department.name.toLowerCase() === normalized,
    )?.id;
  }

  function rowToPayload(row: Record<string, string>): CreateActivityPayload {
    const departmentName = firstValue(row, ["Department", "Main Department"]);
    const rawFrequency = firstValue(row, ["Frequency"]).toUpperCase();

    return cleanPayload({
      mainDepartmentId: findDepartmentId(departmentName) ?? "",
      subDepartment: firstValue(row, ["Sub - Department", "Sub Department"]),
      name: firstValue(row, PROCESS_NAME_HEADERS),
      workMethod: firstValue(row, DESCRIPTION_HEADERS),
      code: firstValue(row, ["Activity Code", "Code"]),
      completionDeadline: parseEstimatedHours(
        firstValue(row, ["Estimated Time", "Estimated Duration"]),
      ),
      purpose: firstValue(row, ["Purpose"]),
      frequency: rawFrequency || "DAILY",
      completionOutput: firstValue(row, ["Expected Output", "Output"]),
      primaryResponsibleDesignation: firstValue(row, [
        "Responsible Job Designation",
        "Primary Responsible Designation",
        "Responsible Designation",
      ]),
      evidenceRequired: firstValue(row, ["Documents Required", "Documents"]),
      effectiveFrom: todayKey(),
    });
  }

  function rowToIngestPayload(
    row: Record<string, string>,
    rowNumber: number,
  ): IngestActivityRowPayload {
    return {
      rowNumber,
      responsibleEmployeeCode: firstValue(row, [
        "Emp ID",
        "Employee ID",
        "Employee Code",
        "Responsible Emp ID",
        "Responsible Employee Code",
      ]),
      parentActivityCode: firstValue(row, [
        "Parent Activity Code",
        "Parent Code",
        "Prerequisite Activity Code",
        "Prerequisite Code",
      ]),
      activity: rowToPayload(row),
    };
  }

  async function importFile(file: File) {
    if (!accessToken) return;
    setImporting(true);
    setMessage(null);
    try {
      const rows = await parseActivityRows(file);
      const headerIndex = findActivityHeaderRowIndex(rows);
      if (headerIndex === -1) {
        throw new Error(
          "Could not find activity headers. Include Process Name and Description / SOP columns.",
        );
      }

      const headers = rows[headerIndex];
      const dataRows = rows.slice(headerIndex + 1);
      if (!headers || dataRows.length === 0) {
        throw new Error("No activity rows found in the file.");
      }
      const normalizedHeaders = headers.map(normalizeHeader);
      const parsedRows = dataRows.map((row, index) => ({
        rowNumber: headerIndex + index + 2,
        values: row,
        row: Object.fromEntries(
          normalizedHeaders.map((header, columnIndex) => [
            header,
            row[columnIndex] ?? "",
          ]),
        ),
      }));
      const rowByNumber = new Map(parsedRows.map((row) => [row.rowNumber, row]));
      const payloads = parsedRows
        .map(({ row, rowNumber }) => rowToIngestPayload(row, rowNumber))
        .filter(
          (payload) => payload.activity.name && payload.activity.workMethod,
        );

      if (payloads.length === 0) {
        throw new Error(
          "No valid rows found. Process Name and Description / SOP are required.",
        );
      }

      const result = await DwmsService.ingestActivities(
        accessToken,
        payloads,
        file.name,
      );
      const failures = result.results.filter((row) => !row.success);
      if (failures.length > 0) {
        const failureByRowNumber = new Map(
          failures.map((failure) => [failure.rowNumber, failure.message]),
        );
        const failedCsvRows = [
          [...headers, "Import Error"],
          ...failures.map((failure) => {
            const originalRow = rowByNumber.get(failure.rowNumber)?.values ?? [];
            return [
              ...headers.map((_, columnIndex) => originalRow[columnIndex] ?? ""),
              failureByRowNumber.get(failure.rowNumber) ?? failure.message,
            ];
          }),
        ];
        setFailedRowsCsv({
          fileName: failedRowsFileName(file.name),
          content: rowsToCsv(failedCsvRows),
        });
      }
      const failureSummary = failures
        .slice(0, 3)
        .map((row) => `Row ${row.rowNumber}: ${row.message}`)
        .join(" ");
      setMessage(
        failures.length > 0
          ? `Imported ${result.created} activities and tasks. ${result.failed} rows failed. ${failureSummary}`
          : `Imported ${result.created} activities and tasks successfully.`,
      );
      onCreated?.();
    } catch (error) {
      setMessage(getDwmsErrorMessage(error, "Failed to import activities"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {!canManageActivities ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 lg:col-span-12">
          Activity creation is available to Management, Admin, Super Admin, HR,
          and HOD users.
        </div>
      ) : (
        <form
          onSubmit={submitActivity}
          className="space-y-6 rounded-2xl border border-border-app bg-white p-6 shadow-sm lg:col-span-8"
        >
          {message && (
            <div
              className={`space-y-3 rounded-xl border p-4 text-xs ${message.includes("success") || message.includes("Imported") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}
            >
              <p>{message}</p>
              {failedRowsCsv && (
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      failedRowsCsv.fileName,
                      failedRowsCsv.content,
                      "text/csv;charset=utf-8",
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download failed rows</span>
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <SelectField
              label="Department"
              value={form.mainDepartmentId ?? ""}
              options={departmentOptions}
              placeholder="Choose department"
              onChange={(value) => setField("mainDepartmentId", value)}
            />
            <TextField
              label="Sub - Department"
              placeholder="Assembly"
              value={form.subDepartment ?? ""}
              onChange={(value) => setField("subDepartment", value)}
            />
            <TextField
              label="Process Name"
              placeholder="Daily line startup inspection"
              required
              value={form.name}
              onChange={(value) => setField("name", value)}
            />
            <TextField
              label="Activity Code"
              placeholder="Optional code: PROD-001"
              value={form.code ?? ""}
              onChange={(value) => setField("code", value)}
            />
            <TextField
              label="Estimated Time"
              type="number"
              min={0}
              step={1}
              placeholder="2"
              value={form.completionDeadline ?? ""}
              onChange={(value) =>
                setField(
                  "completionDeadline",
                  value === "" ? null : Math.max(0, Math.trunc(Number(value))),
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
              label="Responsible Job Designation"
              placeholder="Shift supervisor"
              value={form.primaryResponsibleDesignation ?? ""}
              onChange={(value) =>
                setField("primaryResponsibleDesignation", value)
              }
            />
            <TextField
              label="Expected Output"
              placeholder="Checklist completed and abnormalities reported"
              value={form.completionOutput ?? ""}
              onChange={(value) => setField("completionOutput", value)}
            />
            <TextField
              label="Documents Required"
              placeholder="Startup checklist, SOP reference"
              value={form.evidenceRequired ?? ""}
              onChange={(value) => setField("evidenceRequired", value)}
            />
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
                onChange={(value) => setField("parentActivityIds", value ? [value] : [])}
                triggerClassName="h-auto rounded-xl border-zinc-200 px-4 py-3 text-sm font-medium text-text-app focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20"
              />
            </label>
          </div>

          <TextArea
            label="Description / SOP"
            required
            placeholder="Describe the exact steps, SOP, or standard method to follow."
            value={form.workMethod ?? ""}
            onChange={(value) => setField("workMethod", value)}
          />
          <TextArea
            label="Purpose"
            placeholder="Why this activity is performed and what risk or process it controls."
            value={form.purpose ?? ""}
            onChange={(value) => setField("purpose", value)}
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
        <aside className="space-y-4 rounded-2xl border border-border-app bg-white p-6 shadow-sm lg:col-span-4">
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
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500">
            Required headers: Process Name, Description / SOP, Frequency, and
            Emp ID. XLSX imports use the first worksheet. Activity ingestion
            does not use due dates; rows must use DAILY, WEEKLY, MONTHLY,
            QUARTERLY, or YEARLY. Optional headers: Department, Sub -
            Department, Activity Code, Estimated Time, Purpose, Responsible Job
            Designation, Expected Output, Documents Required, Parent Activity Code. Emp ID can also be
            named Employee ID, Employee Code, Responsible Emp ID, or Responsible
            Employee Code.
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
