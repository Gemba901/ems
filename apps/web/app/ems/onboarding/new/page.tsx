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
  EmsService, CommunicationChannel, COMMUNICATION_CHANNEL_LABELS,
} from "@/services/ems.service";
import { ArrowLeft, Loader2, Upload, AlertCircle, FileSpreadsheet, CheckCircle2, Info, ArrowDown } from "lucide-react";
import {
  findHeaderRow, scoreHeaderRow, MAPPABLE_FIELDS, MapField, NameOrder, requiredFields, findMappingConflicts,
} from "../column-map";
import {
  importHeaderCells, initialImportMapping, buildImportRows, packImportRows,
  applyRememberedChoices, columnChoicesToSave, headingSaysIgnore,
} from "../import-extra-fields";
import { inferDateOrder, type DateOrder } from "@/components/ems/import-dates";
import TemplateCard from "./TemplateCard";
import ConfirmDialog from "@/components/ems/ConfirmDialog";
import SearchableSelect from "@/components/ems/SearchableSelect";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
  // An import whose rows all arrived but whose check didn't finish: kept, so HR can open it and retry.
  const [savedImport, setSavedImport] = useState<{ id: string; label: string; rows: number } | null>(null);
  const [mapping, setMapping] = useState<(MapField | null)[]>([]);
  // Columns whose choice came from this organisation's remembered choices.
  const [remembered, setRemembered] = useState<boolean[]>([]);
  // Day/month order HR chose (or remembered) for date columns whose values don't show it.
  const [dateOrderChoice, setDateOrderChoice] = useState<Record<number, DateOrder>>({});
  // Discards a late remembered-choices answer after the sheet, header row or a choice changed.
  const lookupSequence = useRef(0);
  // Result of forgetting remembered choices: a short confirmation or an error, shown above the column list.
  const [memoryNote, setMemoryNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [forgetting, setForgetting] = useState(false);
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

  /** Built-in recognition first, then this organisation's remembered choices on top. */
  function startMapping(rows: unknown[][], index: number) {
    const headers = importHeaderCells(rows, index);
    const initial = initialImportMapping(headers, rows.slice(index + 1));
    setMapping(initial);
    setRemembered([]);
    setDateOrderChoice({});
    setMemoryNote(null);
    const sequence = ++lookupSequence.current;
    const headings = headers.slice(0, 500).map(cell => String(cell ?? "").trim().slice(0, 200));
    if (!accessToken || !headings.some(Boolean)) return;
    EmsService.lookupImportColumnChoices(headings, accessToken)
      .then(({ choices }) => {
        if (sequence !== lookupSequence.current) return;
        const applied = applyRememberedChoices(headers, initial, choices);
        setMapping(applied.mapping);
        setRemembered(applied.remembered);
        setDateOrderChoice(applied.dateOrders);
      })
      // Remembered choices are a convenience: built-in recognition still applies without them.
      .catch(() => undefined);
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
    if (found >= 0) startMapping(rows, found);
    else { lookupSequence.current++; setMapping([]); setRemembered([]); setDateOrderChoice({}); }
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
      // cellNF keeps each cell's number format, so date cells can be told apart from plain numbers like 220987.
      const wb = XLSX.read(buffer, { type: "array", cellNF: true });
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
  const headerRow = importHeaderCells(grid, headerIndex);
  const fields = mapping;

  // Required fields for this organisation, and any of them no column is mapped to.
  const required = requiredFields(channel);
  const hasFullName = fields.includes("fullName");
  // A mapped full name supplies first and last name, so those count as covered.
  const covered = new Set<string>(fields.filter((f): f is MapField => !!f));
  if (hasFullName) { covered.add("firstName"); covered.add("lastName"); }
  const isRequired = (key: MapField) => (required as Set<string>).has(key);
  const missingRequired = MAPPABLE_FIELDS.filter(({ key }) => isRequired(key) && !covered.has(key));

  // Columns competing for the same field (from auto-mapping or a changed header row). HR must pick one.
  const conflicts = findMappingConflicts(fields);
  const conflictFields = new Set<MapField>(conflicts.map((c) => c.field));
  const fieldLabel = (key: MapField) => MAPPABLE_FIELDS.find((f) => f.key === key)?.label ?? key;
  /** Up to three different example values from a column, for telling competing columns apart. */
  const samplesFor = (col: number) => {
    const seen: string[] = [];
    for (let i = headerIndex + 1; i < grid.length && seen.length < 3; i++) {
      const text = String(grid[i]?.[col] ?? "").trim();
      if (text && !seen.includes(text)) seen.push(text);
    }
    return seen;
  };
  /**
   * Forget the organisation's remembered choices for these columns. Each column goes back to built-in
   * recognition, so HR can see how a sheet imports without memory. Uploading will remember the new choices.
   */
  async function forgetRemembered(cols: number[]) {
    const headings = cols.map(col => String(headerRow[col] ?? "").trim().slice(0, 200)).filter(Boolean);
    if (!accessToken || !headings.length) return;
    setForgetting(true); setMemoryNote(null);
    try {
      await EmsService.forgetImportColumnChoices(headings, accessToken);
      lookupSequence.current++;
      const builtIn = initialImportMapping(headerRow, grid.slice(headerIndex + 1));
      setMapping(prev => prev.map((f, i) => cols.includes(i) ? builtIn[i] ?? null : f));
      setRemembered(prev => prev.map((flag, i) => cols.includes(i) ? false : flag));
      setDateOrderChoice(prev => Object.fromEntries(Object.entries(prev).filter(([col]) => !cols.includes(Number(col)))));
      setMemoryNote({ text: headings.length === 1 ? `Forgot the remembered choice for “${headings[0]}”.` : `Forgot ${headings.length} remembered choices.` });
    } catch {
      setMemoryNote({ text: 'Could not forget the remembered choices. Try again.', error: true });
    } finally {
      setForgetting(false);
    }
  }

  /** Keep one column for a field; the others it was competing with become "ignore". */
  function resolveConflict(field: MapField, keep: number | null) {
    lookupSequence.current++;
    setMapping((prev) => prev.map((f, i) => (f === field && i !== keep ? null : f)));
  }

  const unmatched =
    headerIndex >= 0
      ? headerRow
          .map((cell, i) => (fields[i] ? null : String(cell ?? "").trim()))
          .filter((v): v is string => !!v)
      : [];

  // Each date column's day/month order: proven by its values when possible, otherwise HR's choice
  // (remembered or picked below), defaulting to Day/Month/Year. A column showing both orders stays
  // unresolved: its unclear dates are left as written for HR to choose in the editor.
  const dateEvidence: Record<number, DateOrder | 'MIXED' | null> = {};
  const dateOrders: Record<number, DateOrder | null> = {};
  if (headerIndex >= 0) fields.forEach((field, col) => {
    if (field !== 'profile:dateOfBirth' && field !== 'profile:dateJoined') return;
    const sheet = workbook?.Sheets[sheetName];
    const values = grid.slice(headerIndex + 1).map((row, i) => {
      const cell = sheet?.[XLSX.utils.encode_cell({ r: firstRow + headerIndex + 1 + i, c: (sheet?.["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.c : 0) + col })];
      return String(cell?.w ?? row[col] ?? "").trim();
    });
    const evidence = inferDateOrder(values);
    dateEvidence[col] = evidence;
    dateOrders[col] = evidence === 'MIXED' ? null : evidence ?? dateOrderChoice[col] ?? 'DMY';
  });
  const parsed = buildImportRows(grid, headerIndex, firstRow, fields, nameOrder,
    workbook?.Sheets[sheetName], !!workbook?.Workbook?.WBProps?.date1904, { dateOrders });
  const rows = parsed.rows;
  const extraColumns = fields.filter(f => f === 'extra').length;
  const profileColumns = fields.filter(f => f?.startsWith('profile:')).length;

  async function handleUpload() {
    if (!accessToken || rows.length === 0) return;
    // Check everything first, so HR sees every blocker at once rather than one per click.
    const problems: string[] = [...parsed.errors.slice(0, 3)];
    let chunks: typeof rows[] = [];
    try { chunks = packImportRows(rows, MAX_CHUNK_BYTES, MAX_CHUNK_ROWS); }
    catch (error) { problems.push(error instanceof Error ? error.message : "Check the size of the imported values."); }
    if (!defaultPhoneCountry) {
      problems.push(countryText.trim()
        ? `choose a country from the list ("${countryText.trim()}" isn't one)`
        : "choose a default country for phone numbers");
    }
    if (!channel) problems.push("choose your organisation's communication channel");
    if (conflicts.length > 0) {
      problems.push(`choose which column to use for ${conflicts.map((c) => fieldLabel(c.field)).join(", ")}`);
    }
    setCountryAttention(!defaultPhoneCountry);
    setChannelAttention(!channel);
    if (problems.length > 0) {
      setError(`Before importing, ${problems.join(", and ")}.`);
      // Jump to the first problem on the page.
      const first = document.getElementById(
        !defaultPhoneCountry ? "default-phone-country" : !channel ? "communication-channel" : "mapping-conflicts",
      );
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!defaultPhoneCountry) first?.focus({ preventScroll: true });
      return;
    }
    setBusy(true);
    setError(null);
    setSavedImport(null);
    let batchId: string | null = null;
    let sent = 0;
    // Which step failed decides what's safe to do afterwards.
    let step: "create" | "upload" | "validate" = "create";
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
      step = "upload";

      // Send rows in as few requests as fit under the server's size limit.
      for (const chunk of chunks) {
        setProgress(`Uploading rows ${sent + 1}–${sent + chunk.length} of ${rows.length}…`);
        await EmsService.addOnboardingRecordsAck(batch.id, { records: chunk }, accessToken);
        sent += chunk.length;
      }

      // Every chunk was acknowledged: all rows are saved on the server from here on.
      step = "validate";
      // Remember these choices for the next import. Never blocks or fails the import.
      await EmsService.saveImportColumnChoices(columnChoicesToSave(headerRow, fields, dateOrders), accessToken).catch(() => undefined);
      setProgress(`Checking ${rows.length} rows…`);
      await EmsService.validateOnboardingBatchAck(batch.id, accessToken);
      queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
      router.push(`/ems/onboarding/${batch.id}`);
    } catch (e: any) {
      let message = e.message || "Upload failed.";

      // All rows arrived; only the check didn't finish. Keep the import: HR can open it and validate again.
      if (step === "validate" && batchId) {
        queryClient.invalidateQueries({ queryKey: ["ems-onboarding-batches"] });
        setSavedImport({ id: batchId, label: label || fileName, rows: rows.length });
        setError(null);
        setProgress(null);
        setBusy(false);
        return;
      }

      // The upload stopped part-way. The last request may or may not have been saved, so resending could
      // duplicate rows: cancel this import instead, and HR simply tries again.
      if (batchId) {
        try {
          await EmsService.cancelOnboardingBatch(batchId, accessToken);
          message += sent > 0
            ? ` The upload stopped after ${sent} of ${rows.length} rows (possibly a few more), so this import was cancelled. Please try again.`
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
          <Link href="/ems/onboarding" className="text-muted-foreground hover:text-muted-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New import</h1>
            <p className="text-sm text-muted-foreground">Upload a spreadsheet of employees to review before registering</p>
          </div>
        </div>

        {!workbook && isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
            <div><p className="text-sm font-semibold text-primary">First import for this organization?</p>
              <p className="text-xs text-primary">Set up the departments in your employee sheet before importing.</p></div>
            <Link href="/ems/onboarding/departments" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary">Set up departments</Link>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-4">

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
                  dragging ? "border-muted-foreground bg-muted"
                    : workbook ? "border-success/50 bg-success-subtle/40"
                    : "border-border bg-muted"
                }`}
              >
                <Input
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
                    <CheckCircle2 className="h-9 w-9 text-success" />
                    <div>
                      <p className="text-sm font-semibold text-foreground break-all">{fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {rows.length > 0
                          ? <><span className="font-semibold">{rows.length}</span> employee row{rows.length === 1 ? "" : "s"} found{workbook.SheetNames.length > 1 ? ` on "${sheetName}"` : ""}</>
                          : "No employee rows found yet. Check the sheet and header row below."}
                      </p>
                    </div>
                    <label className="flex w-full max-w-sm items-center gap-2 text-left text-xs text-muted-foreground">
                      <span className="shrink-0 font-medium">Import name</span>
                      <Input
                        type="text"
                        value={label}
                        onChange={(e) => { setLabel(e.target.value); setLabelEdited(e.target.value.trim() !== ""); }}
                        placeholder="e.g. Nairobi plant, January intake"
                        className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <Button variant="ghost"
                        type="button"
                        onClick={() => document.getElementById("import-review")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary h-auto whitespace-normal"
                      >
                        Review columns & preview <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => fileInput.current?.click()}
                        className="text-sm font-medium text-muted-foreground hover:text-foreground h-auto whitespace-normal"
                      >
                        Change file
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Spreadsheet to import</p>
                      <p className="text-xs text-muted-foreground">Drag your filled-in file here, or</p>
                    </div>
                    <Button variant="ghost"
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary h-auto whitespace-normal"
                    >
                      Choose file
                    </Button>
                    <p className="text-xs text-muted-foreground">.xlsx, .xls or .csv</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="default-phone-country"
              className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
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
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 text-info" />
                <span><span className="font-semibold">{countryText}</span> was used in your last import. Change it if this import is for another country.</span>
                <Button variant="ghost" type="button" onClick={() => chooseCountry("")} className="font-medium text-info hover:text-info h-auto whitespace-normal">
                  Clear
                </Button>
              </p>
            )}

            {countryAttention && (
              <p className="mt-1 text-xs font-semibold text-danger">
                {countryText.trim() ? "Choose a country from the list." : "Select a country to continue."}
              </p>
            )}

            <p id="default-phone-country-help" className="mt-2 text-xs text-muted-foreground">
              Local numbers like 0712 345 678 get{" "}
              <span className="font-semibold">
                {COUNTRY_OPTIONS.find((c) => c.value === defaultPhoneCountry)?.hint ?? "this country's code"}
              </span>{" "}
              added.{" "}
              <Button variant="ghost" type="button" onClick={() => setCountryMore((v) => !v)} className="font-medium text-info hover:text-info h-auto whitespace-normal">
                {countryMore ? "Less" : "More"}
              </Button>
            </p>
            {countryMore && (
              <p className="mt-1 text-xs text-muted-foreground">
                Numbers that already start with + and a country code keep it, so staff in other
                countries just need their full international number in the spreadsheet.
              </p>
            )}
          </div>

          <div
            id="communication-channel"
            className={channelAttention ? "rounded-lg ring-2 ring-danger bg-danger-subtle/40 p-3 -mx-3" : ""}
          >
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Organisation communication channel
            </span>

            {!channelLoaded ? (
              <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </p>
            ) : channel && !changingChannel ? (
              <p className="mt-1 text-sm text-foreground">
                {COMMUNICATION_CHANNEL_LABELS[channel]}
                <Button variant="ghost"
                  onClick={() => setChangingChannel(true)}
                  disabled={resettingChannel}
                  className="ml-2 text-xs font-medium text-info hover:text-info disabled:opacity-50 h-auto whitespace-normal"
                >
                  Change
                </Button>
                {DEMO_TOOLS && isAdmin && (
                  <Button variant="ghost"
                    onClick={() => { setResetError(null); setConfirmingReset(true); }}
                    disabled={savingChannel || resettingChannel}
                    className="ml-3 text-xs font-medium text-danger hover:text-danger disabled:opacity-50 h-auto whitespace-normal"
                  >
                    Reset (demo)
                  </Button>
                )}
              </p>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                {(Object.keys(COMMUNICATION_CHANNEL_LABELS) as CommunicationChannel[]).map((option) => (
                  <Button variant="ghost"
                    key={option}
                    onClick={() => saveChannel(option)}
                    disabled={savingChannel || resettingChannel}
                    className={`h-auto whitespace-normal px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-50 ${
                      channel === option
                        ? "border-info bg-info-subtle text-info"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {COMMUNICATION_CHANNEL_LABELS[option]}
                  </Button>
                ))}
                {channel && (
                  <Button variant="ghost"
                    onClick={() => setChangingChannel(false)}
                    className="text-xs text-muted-foreground hover:text-muted-foreground h-auto whitespace-normal"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {resetError && <p className="mt-2 text-xs font-semibold text-danger">{resetError}</p>}

            {channelAttention && (
              <p className="mt-2 text-xs font-semibold text-danger">Choose WhatsApp or email to continue.</p>
            )}

            <p className="mt-2 text-xs text-muted-foreground">
              Decides which contact every employee needs: a WhatsApp number or an email address. Email can be a work or personal address.{" "}
              <Button variant="ghost" type="button" onClick={() => setChannelMore((v) => !v)} className="font-medium text-info hover:text-info h-auto whitespace-normal">
                {channelMore ? "Less" : "More"}
              </Button>
            </p>
            {channelMore && (
              <p className="mt-1 text-xs text-muted-foreground">
                It applies to your whole organisation and is how the system will contact your
                employees. Changing it re-checks your other unfinished imports.
              </p>
            )}
          </div>


          {/* Sheet picker — only when the workbook has more than one */}
          {workbook && workbook.SheetNames.length > 1 && (
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sheet</span>
              <NativeSelect
                value={sheetName}
                onChange={(e) => {
                  setSheetName(e.target.value);
                  loadSheet(workbook, e.target.value);
                }}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring/20"
              >
                {workbook.SheetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </NativeSelect>
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Which row is being read as headers. "Review columns & preview" scrolls here. */}
          {grid.length > 0 && (
            <div id="import-review" className="scroll-mt-6 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
              {headerIndex >= 0 ? (
                <>
                  Reading column names from <span className="font-semibold text-foreground">row {firstRow + headerIndex + 1}</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{fields.filter(Boolean).length} columns matched</span>
                </>
              ) : (
                <>No header row found</>
              )}
              <Button variant="ghost"
                onClick={() => setPickingHeader((v) => !v)}
                className="font-medium text-info hover:text-info h-auto whitespace-normal"
              >
                {pickingHeader ? "Done" : "Change"}
              </Button>
            </div>
          )}

          {/* Manual header picker */}
          {pickingHeader && grid.length > 0 && (
            <div className="border border-border rounded-xl overflow-hidden">
              <p className="px-3 py-2 text-xs text-muted-foreground bg-muted border-b border-border">
                Click the row that holds your column names
              </p>
              <div className="max-h-64 overflow-auto">
                {grid.slice(0, HEADER_SEARCH_DEPTH).map((row, i) => {
                  const matches = scoreHeaderRow(row);
                  const chosen = i === headerIndex;
                  return (
                    <Button variant="ghost"
                      key={i}
                      onClick={() => {
                        setHeaderIndex(i);
                        startMapping(grid, i);
                        setPickingHeader(false);
                        setError(null);
                      }}
                      className={`h-auto whitespace-normal w-full text-left px-3 py-2 text-xs border-b border-border flex items-start gap-2 hover:bg-muted ${
                        chosen ? "bg-info-subtle" : ""
                      }`}
                    >
                      <span className="text-muted-foreground w-6 shrink-0">{firstRow + i + 1}</span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" · ") || "(empty)"}
                      </span>
                      {matches > 0 && (
                        <span className="shrink-0 text-[10px] font-semibold text-success">
                          {matches} match{matches === 1 ? "" : "es"}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {headerIndex >= 0 && (extraColumns > 0 || profileColumns > 0) && <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
            {extraColumns} additional column(s) kept for reference · {profileColumns} mapped to existing profile fields.
            Review or change each choice below. Ignored columns are not uploaded. Reference values stay available after registration.
            Your choices are remembered for this organisation’s next import.
          </p>}
          {!!parsed.errors.length && <p role="alert" className="text-xs text-danger">{parsed.errors[0]}{parsed.errors.length > 1 ? ` (${parsed.errors.length} affected rows)` : ''}</p>}
          {unmatched.length > 0 && (
            <div className="text-xs text-warning bg-warning-subtle border border-warning/30 rounded-lg px-3 py-2">
              Ignored columns: {unmatched.join(", ")}
            </div>
          )}

          {headerIndex >= 0 && conflicts.length > 0 && (
            <div id="mapping-conflicts" className="scroll-mt-6 rounded-xl border-2 border-warning/50 bg-warning-subtle p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
                <div>
                  <p className="text-sm font-semibold text-warning">
                    {conflicts.length === 1 ? "Two columns are" : "Some columns are"} competing for the same field
                  </p>
                  <p className="text-xs text-warning">
                    Choose which column to use for each field. The others will be ignored. Import is paused until each is chosen.
                  </p>
                </div>
              </div>
              {conflicts.map(({ field, columns }) => (
                <fieldset key={field} className="min-w-0 rounded-lg border border-warning/30 bg-card p-3">
                  <legend className="px-1 text-xs font-semibold text-foreground">
                    {fieldLabel(field)}{isRequired(field) ? " *" : ""}
                  </legend>
                  <RadioGroup
                    aria-label={`Column to use for ${fieldLabel(field)}`}
                    className="gap-2"
                    onValueChange={(value) => resolveConflict(field, value as number)}
                  >
                    {columns.map((col) => {
                      const samples = samplesFor(col);
                      return (
                        <label key={col} className="flex min-w-0 cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted">
                          <RadioGroupItem value={col} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-medium text-foreground">
                              {String(headerRow[col] ?? "").trim() || `Column ${col + 1}`}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {samples.length > 0 ? `e.g. ${samples.join(" · ")}` : "No values in this column"}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    <Button variant="ghost"
                      type="button"
                      onClick={() => resolveConflict(field, null)}
                      className="justify-self-start text-xs font-medium text-muted-foreground hover:text-foreground h-auto whitespace-normal"
                    >
                      Ignore all of these
                    </Button>
                  </RadioGroup>
                </fieldset>
              ))}
            </div>
          )}

          {headerIndex >= 0 && headerRow.length > 0 && (
                <div className="border-2 border-border rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-muted border-b border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Match your columns to the fields they hold · <span className="text-danger">*</span> required
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fields.filter(f => f && f !== "extra").length} mapped · {extraColumns} kept for reference
                      {remembered.some(Boolean) && <> · <Button variant="ghost" type="button" disabled={forgetting}
                        onClick={() => void forgetRemembered(remembered.flatMap((flag, i) => flag ? [i] : []))}
                        className="font-medium text-info underline underline-offset-2 disabled:opacity-50 h-auto whitespace-normal">Forget all remembered ({remembered.filter(Boolean).length})</Button></>}
                    </p>
                  </div>
                  {memoryNote && <p role="status" className={`border-b border-border px-3 py-1.5 text-xs ${memoryNote.error ? 'bg-danger-subtle text-danger' : 'bg-info-subtle text-info'}`}>{memoryNote.text}</p>}
                  <div className="max-h-72 overflow-auto divide-y divide-border">
                    {headerRow.map((cell, col) => {
                      const name = String(cell ?? "").trim() || `Untitled column ${XLSX.utils.encode_col(col)}`;
                      if (!String(cell ?? "").trim() && !grid.slice(headerIndex + 1).some(row => String(row[col] ?? "").trim())) return null;

                      const sample = grid
                        .slice(headerIndex + 1, headerIndex + 6)
                        .map((r) => String(r[col] ?? "").trim())
                        .find(Boolean);

                      // A field already taken by another column
                      const takenElsewhere = (key: MapField) =>
                        fields.some((f, i) => f === key && i !== col);

                      return (
                        <div key={col} className="px-3 py-2 flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground break-words sm:truncate" title={name}>{name}</p>
                            {sample && (
                              <p className="text-[11px] text-muted-foreground truncate">e.g. {sample}</p>
                            )}
                            {remembered[col] && (
                              <p className="text-[11px] font-medium text-info">Remembered from a previous import · <Button variant="ghost" type="button" disabled={forgetting}
                                onClick={() => void forgetRemembered([col])} className="underline underline-offset-2 disabled:opacity-50 h-auto whitespace-normal">Forget</Button></p>
                            )}
                            {!fields[col] && headingSaysIgnore(cell) && (
                              <p className="text-[11px] font-medium text-muted-foreground">Ignored: the heading says “ignore”</p>
                            )}
                            {col in dateEvidence && (dateEvidence[col] === 'MIXED'
                              ? <p className="text-[11px] font-medium text-warning">Dates use both day-first and month-first orders. Unclear dates will offer both readings to choose from.</p>
                              : dateEvidence[col]
                              ? <p className="text-[11px] text-muted-foreground">Dates read {dateEvidence[col] === 'DMY' ? 'Day/Month/Year' : 'Month/Day/Year'}, shown by values in this column</p>
                              : <label className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                                  <span>No value shows the order. Dates are written</span>
                                  <NativeSelect aria-label={`Date order for ${name}`} value={dateOrders[col] ?? 'DMY'}
                                    onChange={(event) => { const value = event.target.value as DateOrder; setDateOrderChoice((prev) => ({ ...prev, [col]: value })); }}
                                    className="rounded border border-border bg-card px-1 py-0.5 text-[11px]">
                                    <option value="DMY">Day/Month/Year (09/08/87 = 9 Aug 1987)</option>
                                    <option value="MDY">Month/Day/Year (09/08/87 = 8 Sep 1987)</option>
                                  </NativeSelect>
                                </label>)}
                            {fields[col] && conflictFields.has(fields[col]!) && (
                              <p className="text-[11px] font-medium text-warning">Competing with another column: choose one above</p>
                            )}
                          </div>
                          <NativeSelect
                            value={fields[col] ?? ""}
                            onChange={(e) => {
                              const value = (e.target.value || null) as MapField | null;
                              lookupSequence.current++;
                              setRemembered((prev) => prev.map((flag, i) => (i === col ? false : flag)));
                              setMapping((prev) => {
                                const next = [...prev];
                                // A field can only be used once — clear any other column holding it
                                if (value && value !== "extra") {
                                  for (let i = 0; i < next.length; i++) {
                                    if (next[i] === value) next[i] = null;
                                  }
                                }
                                next[col] = value;
                                return next;
                              });
                            }}
                            aria-label={`Field for ${name}`}
                            className={`shrink-0 w-full sm:w-56 px-2 py-1.5 rounded-lg border text-xs bg-card focus:outline-none focus:ring-2 focus:ring-ring/20 ${
                              fields[col] && conflictFields.has(fields[col]!) ? "border-warning ring-1 ring-warning text-foreground"
                                : fields[col] ? "border-border text-foreground" : "border-border text-muted-foreground"
                            }`}
                          >
                            <option value="">— ignore this column —</option>
                            <option value="extra">Keep for reference</option>
                            {MAPPABLE_FIELDS.map(({ key, label }) => (
                              <option key={key} value={key} disabled={takenElsewhere(key)}>
                                {label}{isRequired(key) ? " *" : ""}{takenElsewhere(key) ? " (already used)" : ""}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

          {headerIndex >= 0 && hasFullName && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2">
              <span className="font-semibold">Full names are written:</span>
              <RadioGroup
                aria-label="Full name order"
                className="flex w-auto flex-wrap items-center gap-3"
                value={nameOrder}
                onValueChange={(value) => setNameOrder(value as NameOrder)}
              >
                {([["FIRST_LAST", "First … Last (Peter Kamau Otieno)"], ["LAST_FIRST", "Last … First (Otieno Peter Kamau)"]] as const).map(
                  ([value, text]) => (
                    <label key={value} className="inline-flex items-center gap-1.5">
                      <RadioGroupItem value={value} />
                      {text}
                    </label>
                  ),
                )}
              </RadioGroup>
              <span className="text-muted-foreground">A surname in CAPITALS is always used as the last name. Check the preview below.</span>
            </div>
          )}

          {headerIndex >= 0 && missingRequired.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-warning bg-warning-subtle border border-warning/30 rounded-lg px-3 py-2">
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
              <div className="border-t-2 border-border pt-4 text-sm text-foreground">
                <span className="font-semibold text-foreground">{rows.length}</span> rows ready to import
              </div>

              <div className="border-2 border-border rounded-xl overflow-hidden">
                <Table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted text-muted-foreground">
                      <th className="text-left px-3 py-2 font-semibold">Row</th>
                      <th className="text-left px-3 py-2 font-semibold">Code</th>
                      <th className="text-left px-3 py-2 font-semibold">First name</th>
                      <th className="text-left px-3 py-2 font-semibold">Middle name</th>
                      <th className="text-left px-3 py-2 font-semibold">Last name</th>
                      <th className="text-left px-3 py-2 font-semibold">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 5).map((r) => (
                      <tr key={r.rowNumber}>
                        <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.employeeCode ?? "—"}</td>
                        <td className="px-3 py-2 text-foreground">{r.firstName ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.middleName ?? "—"}</td>
                        <td className="px-3 py-2 text-foreground">{r.lastName ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.currentDepartment ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {rows.length > 5 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground bg-muted">
                    …and {rows.length - 5} more
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <Button variant="ghost"
                onClick={handleUpload}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-info text-info-foreground hover:bg-info disabled:opacity-50 h-auto whitespace-normal"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Import {rows.length} rows
              </Button>
              {progress && (
                <p role="status" className="text-xs text-muted-foreground">{progress}</p>
              )}
              {savedImport && (
                <div role="alert" className="w-full rounded-xl border border-info/30 bg-info-subtle p-3 text-sm text-info">
                  <p>
                    All <span className="font-semibold">{savedImport.rows}</span> rows were saved to
                    {" "}<span className="font-semibold">“{savedImport.label}”</span>, but checking them didn’t finish.
                  </p>
                  <p className="mt-1 text-xs">
                    Nothing is lost. Open the import and use <span className="font-semibold">Validate all</span> to check them again.
                    Don’t import this file again, or you’ll have two copies.
                  </p>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => router.push(`/ems/onboarding/${savedImport.id}`)}
                    className="mt-2 rounded-lg bg-info px-3 py-1.5 text-xs font-semibold text-info-foreground hover:bg-info h-auto whitespace-normal"
                  >
                    Open the import
                  </Button>
                </div>
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
          message={`This applies to every employee in your organisation and re-checks all your unfinished imports. Rows may then need ${pendingChannel === "EMAIL" ? "an email address" : "a WhatsApp number"} before they can be registered.`}
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
