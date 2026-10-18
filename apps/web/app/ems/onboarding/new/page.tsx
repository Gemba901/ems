"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import * as XLSX from "xlsx";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import {
  EmsService, UpdateOnboardingRecordPayload, CommunicationChannel, COMMUNICATION_CHANNEL_LABELS,
} from "@/services/ems.service";
import { ArrowLeft, Loader2, Upload, AlertCircle, FileSpreadsheet, CheckCircle2, Info, ArrowDown } from "lucide-react";
import {
  mapHeaders, findHeaderRow, scoreHeaderRow, MAPPABLE_FIELDS, MapField, NameOrder, requiredFields, splitFullName,
} from "../column-map";
import TemplateCard from "./TemplateCard";
import ConfirmDialog from "@/components/ems/ConfirmDialog";
import SearchableSelect from "@/components/ems/SearchableSelect";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

const PHONE_COUNTRIES = getCountries()
  .map((code) => ({
    code,
    name: countryNames.of(code) ?? code,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** The same list for the searchable dropdown, with each country's dialling code as a hint. */
/** Everyday names people search by, so "usa", "uk" or "ivory coast" find the right country. */
/** Demo-only tools (e.g. resetting the channel) show only when the web app's env enables them. */
/**
 * Upload requests are packed up to this size: under the server's ~100 KB limit, with room to spare.
 * Packing by size (not a fixed row count) means fewer trips for sheets with few columns.
 */
const MAX_CHUNK_BYTES = 80_000;
/** Never more rows than this in one request, however small they are, so each trip stays quick. */
const MAX_CHUNK_ROWS = 500;

/** Split rows into groups that each fit within MAX_CHUNK_BYTES when sent. */
function chunkBySize<T>(rows: T[]): T[][] {
  const encoder = new TextEncoder();
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = encoder.encode(JSON.stringify(row)).length + 1; // +1 for the comma between rows
    if (current.length > 0 && (bytes + size > MAX_CHUNK_BYTES || current.length >= MAX_CHUNK_ROWS)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

const DEMO_TOOLS = process.env.NEXT_PUBLIC_EMS_DEMO_TOOLS === "true";

const COUNTRY_ALIASES: Record<string, { aside?: string; keywords?: string[] }> = {
  US: { aside: "USA", keywords: ["America", "United States of America"] },
  GB: { aside: "UK", keywords: ["Britain", "Great Britain", "England", "Scotland", "Wales", "Northern Ireland"] },
  AE: { aside: "UAE", keywords: ["Emirates", "Dubai", "Abu Dhabi"] },
  CD: { aside: "DRC", keywords: ["Congo", "Democratic Republic of the Congo", "Kinshasa"] },
  CG: { keywords: ["Congo", "Republic of the Congo", "Brazzaville"] },
  CI: { keywords: ["Ivory Coast"] },
  KR: { keywords: ["South Korea"] },
  KP: { keywords: ["North Korea"] },
  NL: { keywords: ["Holland"] },
  SZ: { keywords: ["Swaziland"] },
  CZ: { keywords: ["Czech Republic"] },
  MM: { keywords: ["Burma"] },
  TR: { keywords: ["Turkey"] },
  RU: { keywords: ["Russian Federation"] },
};

const COUNTRY_OPTIONS = PHONE_COUNTRIES.map(({ code, name }) => ({
  value: code,
  label: name,
  hint: `+${getCountryCallingCode(code as Parameters<typeof getCountryCallingCode>[0])}`,
  aside: COUNTRY_ALIASES[code]?.aside,
  keywords: [code, ...(COUNTRY_ALIASES[code]?.keywords ?? [])], // the ISO code too: "ke" finds Kenya
}));

type ParsedRow = UpdateOnboardingRecordPayload & { rowNumber: number };

/** How many rows to offer when picking the header manually. */
const HEADER_SEARCH_DEPTH = 20;

export default function NewOnboardingImportPage() {
  const { accessToken, user: viewer } = useAuthStore();
  const isAdmin = [Role.ADMIN, Role.SUPER_ADMIN].includes(viewer?.roleLevel as Role);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState("");
  const [labelEdited, setLabelEdited] = useState(false); // true once HR types their own import name
  const [defaultPhoneCountry, setDefaultPhoneCountry] = useState("");
  // What HR has typed in the searchable country box; defaultPhoneCountry is set only when it names a real country.
  const [countryText, setCountryText] = useState("");
  const [countryPrefilled, setCountryPrefilled] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [grid, setGrid] = useState<unknown[][]>([]);
  const [firstRow, setFirstRow] = useState(0);
  const [headerIndex, setHeaderIndex] = useState(-1);
  const [pickingHeader, setPickingHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What the upload is doing right now, e.g. "Uploading rows 51–100 of 231…".
  const [progress, setProgress] = useState<string | null>(null);
  const [mapping, setMapping] = useState<(MapField | null)[]>([]);
  // How names in a mapped "Full name" column are written.
  const [nameOrder, setNameOrder] = useState<NameOrder>("FIRST_LAST");

  // Organisation-wide communication channel: decides whether WhatsApp or email is required.
  const [channel, setChannel] = useState<CommunicationChannel | null>(null);
  const [channelLoaded, setChannelLoaded] = useState(false);
  const [changingChannel, setChangingChannel] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  // Demo reset: confirmation open, request in progress, and any error to show.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resettingChannel, setResettingChannel] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function resetChannel() {
    if (!accessToken) return;
    setResettingChannel(true);
    setResetError(null);
    try {
      await EmsService.resetCommunicationChannel(accessToken);
      setChannel(null);
      setChangingChannel(false);
      setConfirmingReset(false);
      // Findings and counts may have changed across unfinished imports.
      queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
      queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batch"] });
      queryClient.invalidateQueries({ queryKey: ["ems-communication-channel"] });
    } catch (e: any) {
      setConfirmingReset(false);
      setResetError(e.message || "Could not reset the channel.");
      // If the outcome is uncertain (e.g. a network drop), re-read the real value rather than guess.
      EmsService.getCommunicationChannel(accessToken)
        .then((result) => setChannel(result.communicationChannel))
        .catch(() => {});
    } finally {
      setResettingChannel(false);
    }
  }
  const [channelAttention, setChannelAttention] = useState(false);
  const [countryAttention, setCountryAttention] = useState(false);
  // Which help texts are expanded ("More").
  const [countryMore, setCountryMore] = useState(false);
  const [channelMore, setChannelMore] = useState(false);
  // A channel HR picked that differs from the saved one, waiting for confirmation.
  const [pendingChannel, setPendingChannel] = useState<CommunicationChannel | null>(null);

  // The imports list (newest first) tells us which country the organisation used last time.
  const { data: previousImports } = useQuery({
    queryKey: ["ems-onboarding-batches"],
    queryFn: () => EmsService.listOnboardingBatches(accessToken!),
    enabled: !!accessToken,
  });

  useEffect(() => {
    if (countryText || !previousImports) return; // never overwrite what HR has typed
    const last = previousImports.find((b) => b.status !== "CANCELLED" && b.defaultPhoneCountry);
    const country = PHONE_COUNTRIES.find((c) => c.code === last?.defaultPhoneCountry);
    if (!country) return;
    setCountryText(country.name);
    setDefaultPhoneCountry(country.code);
    setCountryPrefilled(true);
  }, [previousImports]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseCountry(text: string) {
    setCountryText(text);
    setCountryPrefilled(false);
    setCountryAttention(false);
    const match = PHONE_COUNTRIES.find((c) => c.name.toLowerCase() === text.trim().toLowerCase());
    setDefaultPhoneCountry(match?.code ?? "");
  }

  useEffect(() => {
    if (!accessToken) return;
    EmsService.getCommunicationChannel(accessToken)
      .then((result) => setChannel(result.communicationChannel))
      .catch((e: any) => setError(e.message || "Could not load the communication channel."))
      .finally(() => setChannelLoaded(true));
  }, [accessToken]);

  async function saveChannel(next: CommunicationChannel) {
    if (!accessToken) return;
    // Switching an existing channel affects every open import, so ask first.
    if (channel && channel !== next && pendingChannel !== next) {
      setPendingChannel(next);
      return;
    }
    setPendingChannel(null);
    setSavingChannel(true);
    setChannelAttention(false);
    setError(null);
    try {
      const result = await EmsService.updateCommunicationChannel(next, accessToken);
      setChannel(result.communicationChannel);
      setChangingChannel(false);
    } catch (e: any) {
      setError(e.message || "Could not save the communication channel.");
    } finally {
      setSavingChannel(false);
    }
  }

  /** Read a sheet into a grid and guess where its headers are. */
  function loadSheet(wb: XLSX.WorkBook, name: string) {
    const sheet = wb.Sheets[name];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,  // keep gaps so row positions match Excel
      defval: "",
    });

    setGrid(rows);
    setFirstRow(sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r : 0);
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
    if (!labelEdited) setLabel(file.name.replace(/\.[^.]+$/, ""));

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

  // Required fields for this organisation, and any of them no column is mapped to.
  const required = requiredFields(channel);
  const hasFullName = fields.includes("fullName");
  // A mapped full name supplies first and last name, so those count as covered.
  const covered = new Set<string>(fields.filter((f): f is MapField => !!f));
  if (hasFullName) { covered.add("firstName"); covered.add("lastName"); }
  const isRequired = (key: MapField) => (required as Set<string>).has(key);
  const missingRequired = MAPPABLE_FIELDS.filter(({ key }) => isRequired(key) && !covered.has(key));

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
      const record: ParsedRow = { rowNumber: firstRow + i + 1 };
      let hasValue = false;
      let fullName = "";

      fields.forEach((field, col) => {
        if (!field) return;
        const text = String(grid[i][col] ?? "").trim();
        if (!text) return;
        hasValue = true;
        if (field === "fullName") fullName = text;
        else record[field] = text;
      });

      // Split a full name, but never over names that have their own columns.
      if (fullName) {
        const parts = splitFullName(fullName, nameOrder);
        record.firstName ??= parts.firstName;
        record.middleName ??= parts.middleName;
        record.lastName ??= parts.lastName;
      }

      if (hasValue) out.push(record);
    }
    return out;
  })();

  async function handleUpload() {
    if (!accessToken || rows.length === 0) return;
    // Check everything first, so HR sees every blocker at once rather than one per click.
    const problems: string[] = [];
    if (!defaultPhoneCountry) {
      problems.push(countryText.trim()
        ? `choose a country from the list ("${countryText.trim()}" isn't one)`
        : "choose a default country for phone numbers");
    }
    if (!channel) problems.push("choose your organisation's communication channel");
    setCountryAttention(!defaultPhoneCountry);
    setChannelAttention(!channel);
    if (problems.length > 0) {
      setError(`Before importing, ${problems.join(", and ")}.`);
      // Jump to the first problem on the page.
      const first = document.getElementById(!defaultPhoneCountry ? "default-phone-country" : "communication-channel");
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!defaultPhoneCountry) first?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    setError(null);
    let batchId: string | null = null;
    let sent = 0;
    try {
      const batch = await EmsService.createOnboardingBatch(
        {
          label: label || fileName,
          sourceFileName: fileName,
          defaultPhoneCountry,
        },
        accessToken,
      );
      batchId = batch.id;

      // Send rows in as few requests as fit under the server's size limit.
      for (const chunk of chunkBySize(rows)) {
        setProgress(`Uploading rows ${sent + 1}–${sent + chunk.length} of ${rows.length}…`);
        await EmsService.addOnboardingRecordsAck(batch.id, { records: chunk }, accessToken);
        sent += chunk.length;
      }

      setProgress(`Checking ${rows.length} rows…`);
      await EmsService.validateOnboardingBatchAck(batch.id, accessToken);
      queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
      router.push(`/ems/onboarding/${batch.id}`);
    } catch (e: any) {
      let message = e.message || "Upload failed.";
      // Don't leave a half-uploaded import behind: cancel it, so HR simply tries again.
      if (batchId) {
        try {
          await EmsService.cancelOnboardingBatch(batchId, accessToken);
          message += sent > 0
            ? ` The upload stopped after ${sent} of ${rows.length} rows, so this import was cancelled. Please try again.`
            : " Nothing was imported. Please try again.";
        } catch {
          message += " An unfinished import may be left in the imports list; cancel it there.";
        }
        queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
      }
      setError(message);
      setProgress(null);
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

        {!workbook && isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div><p className="text-sm font-semibold text-violet-950">First import for this organization?</p>
              <p className="text-xs text-violet-900">Set up the departments in your employee sheet before importing.</p></div>
            <Link href="/ems/onboarding/departments" className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-900">Set up departments</Link>
          </div>
        )}

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4">

          {/* Template and file side by side; on narrow screens the template comes first. */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:order-2">
              <TemplateCard channel={channel} />
            </div>
            <div className="md:col-span-2 md:order-1">
              {/* The main action on this page: a drop zone that shows clearly once a file is loaded. */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={`flex h-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragging ? "border-slate-500 bg-slate-100"
                    : workbook ? "border-emerald-300 bg-emerald-50/40"
                    : "border-slate-300 bg-slate-50"
                }`}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = ""; // so choosing the same file again still triggers a change
                  }}
                />

                {workbook ? (
                  <>
                    <CheckCircle2 className="h-9 w-9 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 break-all">{fileName}</p>
                      <p className="text-xs text-slate-600">
                        {rows.length > 0
                          ? <><span className="font-semibold">{rows.length}</span> employee row{rows.length === 1 ? "" : "s"} found{workbook.SheetNames.length > 1 ? ` on "${sheetName}"` : ""}</>
                          : "No employee rows found yet. Check the sheet and header row below."}
                      </p>
                    </div>
                    <label className="flex w-full max-w-sm items-center gap-2 text-left text-xs text-slate-500">
                      <span className="shrink-0 font-medium">Import name</span>
                      <input
                        type="text"
                        value={label}
                        onChange={(e) => { setLabel(e.target.value); setLabelEdited(e.target.value.trim() !== ""); }}
                        placeholder="e.g. Nairobi plant, January intake"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => document.getElementById("import-review")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Review columns & preview <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="text-sm font-medium text-slate-600 hover:text-slate-900"
                      >
                        Change file
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                      <Upload className="h-5 w-5 text-slate-600" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Spreadsheet to import</p>
                      <p className="text-xs text-slate-500">Drag your filled-in file here, or</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Choose file
                    </button>
                    <p className="text-xs text-slate-400">.xlsx, .xls or .csv</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="default-phone-country"
              className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            >
              Default country for phone numbers
            </label>

            <SearchableSelect
              id="default-phone-country"
              options={COUNTRY_OPTIONS}
              value={defaultPhoneCountry}
              text={countryText}
              onTextChange={chooseCountry}
              disabled={busy}
              invalid={countryAttention}
              placeholder="Choose or type a country, e.g. Kenya"
              describedBy="default-phone-country-help"
            />

            {countryPrefilled && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
                <Info className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span><span className="font-semibold">{countryText}</span> was used in your last import. Change it if this import is for another country.</span>
                <button type="button" onClick={() => chooseCountry("")} className="font-medium text-blue-600 hover:text-blue-700">
                  Clear
                </button>
              </p>
            )}

            {countryAttention && (
              <p className="mt-1 text-xs font-semibold text-red-600">
                {countryText.trim() ? "Choose a country from the list." : "Select a country to continue."}
              </p>
            )}

            <p id="default-phone-country-help" className="mt-2 text-xs text-slate-600">
              Local numbers like 0712 345 678 get{" "}
              <span className="font-semibold">
                {COUNTRY_OPTIONS.find((c) => c.value === defaultPhoneCountry)?.hint ?? "this country's code"}
              </span>{" "}
              added.{" "}
              <button type="button" onClick={() => setCountryMore((v) => !v)} className="font-medium text-blue-600 hover:text-blue-700">
                {countryMore ? "Less" : "More"}
              </button>
            </p>
            {countryMore && (
              <p className="mt-1 text-xs text-slate-600">
                Numbers that already start with + and a country code keep it, so staff in other
                countries just need their full international number in the spreadsheet.
              </p>
            )}
          </div>

          <div
            id="communication-channel"
            className={channelAttention ? "rounded-lg ring-2 ring-red-300 bg-red-50/40 p-3 -mx-3" : ""}
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Organisation communication channel
            </span>

            {!channelLoaded ? (
              <p className="mt-1 text-xs text-slate-400 flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </p>
            ) : channel && !changingChannel ? (
              <p className="mt-1 text-sm text-slate-700">
                {COMMUNICATION_CHANNEL_LABELS[channel]}
                <button
                  onClick={() => setChangingChannel(true)}
                  disabled={resettingChannel}
                  className="ml-2 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  Change
                </button>
                {DEMO_TOOLS && isAdmin && (
                  <button
                    onClick={() => { setResetError(null); setConfirmingReset(true); }}
                    disabled={savingChannel || resettingChannel}
                    className="ml-3 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Reset (demo)
                  </button>
                )}
              </p>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                {(Object.keys(COMMUNICATION_CHANNEL_LABELS) as CommunicationChannel[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => saveChannel(option)}
                    disabled={savingChannel || resettingChannel}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50 ${
                      channel === option
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {COMMUNICATION_CHANNEL_LABELS[option]}
                  </button>
                ))}
                {channel && (
                  <button
                    onClick={() => setChangingChannel(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}

            {resetError && <p className="mt-2 text-xs font-semibold text-red-600">{resetError}</p>}

            {channelAttention && (
              <p className="mt-2 text-xs font-semibold text-red-600">Choose WhatsApp or email to continue.</p>
            )}

            <p className="mt-2 text-xs text-slate-600">
              Decides which contact every employee needs: a WhatsApp number or a work email.{" "}
              <button type="button" onClick={() => setChannelMore((v) => !v)} className="font-medium text-blue-600 hover:text-blue-700">
                {channelMore ? "Less" : "More"}
              </button>
            </p>
            {channelMore && (
              <p className="mt-1 text-xs text-slate-600">
                It applies to your whole organisation and is how the system will contact your
                employees. Changing it re-checks your other unfinished imports.
              </p>
            )}
          </div>


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

          {/* Which row is being read as headers. "Review columns & preview" scrolls here. */}
          {grid.length > 0 && (
            <div id="import-review" className="scroll-mt-6 text-xs text-slate-500 flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="h-3.5 w-3.5 text-slate-300" />
              {headerIndex >= 0 ? (
                <>
                  Reading column names from <span className="font-semibold text-slate-700">row {firstRow + headerIndex + 1}</span>
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
                      <span className="text-slate-300 w-6 shrink-0">{firstRow + i + 1}</span>
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
            </div>
          )}

          {headerIndex >= 0 && headerRow.length > 0 && (
                <div className="border-2 border-slate-300 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-100 border-b border-slate-300 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">
                      Match your columns to the fields they hold · <span className="text-red-500">*</span> required
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
                      const takenElsewhere = (key: MapField) =>
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
                              const value = (e.target.value || null) as MapField | null;
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
                                {label}{isRequired(key) ? " *" : ""}{takenElsewhere(key) ? " (already used)" : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

          {headerIndex >= 0 && hasFullName && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <span className="font-semibold">Full names are written:</span>
              {([["FIRST_LAST", "First … Last (Peter Kamau Otieno)"], ["LAST_FIRST", "Last … First (Otieno Peter Kamau)"]] as const).map(
                ([value, text]) => (
                  <label key={value} className="inline-flex items-center gap-1.5">
                    <input type="radio" name="name-order" checked={nameOrder === value} onChange={() => setNameOrder(value)} />
                    {text}
                  </label>
                ),
              )}
              <span className="text-slate-400">A surname in CAPITALS is always used as the last name. Check the preview below.</span>
            </div>
          )}

          {headerIndex >= 0 && missingRequired.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                No column mapped to:{" "}
                <span className="font-semibold">{missingRequired.map((f) => f.label).join(", ")}</span>.
                Every row will be flagged until these are filled in.
              </span>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="border-t-2 border-slate-200 pt-4 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">{rows.length}</span> rows ready to import
              </div>

              <div className="border-2 border-slate-300 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500">
                      <th className="text-left px-3 py-2 font-semibold">Row</th>
                      <th className="text-left px-3 py-2 font-semibold">Code</th>
                      <th className="text-left px-3 py-2 font-semibold">First name</th>
                      <th className="text-left px-3 py-2 font-semibold">Middle name</th>
                      <th className="text-left px-3 py-2 font-semibold">Last name</th>
                      <th className="text-left px-3 py-2 font-semibold">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-2 text-slate-400">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-slate-500">{r.employeeCode ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{r.firstName ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.middleName ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{r.lastName ?? "—"}</td>
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

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Import {rows.length} rows
              </button>
              {progress && (
                <p role="status" className="text-xs text-slate-600">{progress}</p>
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirmingReset}
        title="Reset the channel?"
        message={"Your organisation will have no channel until one is chosen again. Unfinished imports are re-checked.\n\nDemo tool: not available to clients."}
        keepLabel="Keep channel"
        confirmLabel="Reset channel"
        busy={resettingChannel}
        onConfirm={resetChannel}
        onClose={() => setConfirmingReset(false)}
      />

      {pendingChannel && channel && (
        <ConfirmDialog
          open
          tone="primary"
          title={`Switch to ${COMMUNICATION_CHANNEL_LABELS[pendingChannel]}?`}
          message={`This applies to every employee in your organisation and re-checks all your unfinished imports. Rows may then need ${pendingChannel === "EMAIL" ? "a work email" : "a WhatsApp number"} before they can be registered.`}
          keepLabel={`Keep ${COMMUNICATION_CHANNEL_LABELS[channel]}`}
          confirmLabel={`Switch to ${COMMUNICATION_CHANNEL_LABELS[pendingChannel]}`}
          busy={savingChannel}
          onConfirm={() => saveChannel(pendingChannel)}
          onClose={() => setPendingChannel(null)}
        />
      )}
    </ProtectedRoute>
  );
}
