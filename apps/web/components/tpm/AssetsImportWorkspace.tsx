"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
} from "lucide-react";
import { useToast } from "@/contexts/toast.context";
import { useAssets } from "./AssetsProvider";
import { useAssetOperators } from "./useAssetOperators";
import { PreviewState } from "./AssetDetails";
import { AssetTemplatePreview } from "./AssetTemplatePreview";
import {
  ASSET_IMPORT_COLUMNS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  downloadAssetTemplate,
  type AssetImportResult,
} from "./asset-import";
import {
  readAssetImportFile,
  suggestAssetColumnMapping,
  validateMappedAssets,
  type AssetColumnMapping,
  type AssetImportFile,
} from "./asset-import-file";
import "./asset-import.css";

const STEPS = ["Upload file", "Match columns", "Review & import"];
const PAGE_SIZE = 50;

export function AssetsImportWorkspace() {
  const { assets, loading, error: assetsError, importAssets } = useAssets();
  const { members, loading: loadingMembers } = useAssetOperators();
  const { toast } = useToast();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<AssetImportFile | null>(null);
  const [mapping, setMapping] = useState<AssetColumnMapping>({});
  const [result, setResult] = useState<AssetImportResult | null>(null);
  const [busy, setBusy] = useState<
    "read" | "download" | "review" | "import" | null
  >(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [page, setPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  const dragDepth = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(
    () => () => {
      operation.current++;
    },
    [],
  );
  useEffect(() => {
    heading.current?.focus();
  }, [step]);

  const unmatched =
    file?.headers.reduce(
      (count, _, index) => count + (mapping[index] === undefined ? 1 : 0),
      0,
    ) ?? 0;
  const matched = Object.values(mapping).filter(Boolean).length;
  const usedFields = new Set(Object.values(mapping).filter(Boolean));
  const issueRows = new Set(
    result?.issues.flatMap((issue) =>
      issue.rowNumber ? [issue.rowNumber] : [],
    ) ?? [],
  );
  const reviewRows =
    result?.rows.filter((row) => !onlyIssues || issueRows.has(row.rowNumber)) ??
    [];
  const pageCount = Math.max(1, Math.ceil(reviewRows.length / PAGE_SIZE));
  const visibleRows = reviewRows.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  );
  const ready = !!result?.rows.length && result.issues.length === 0;

  async function selectFile(selected: File | undefined) {
    if (!selected || busy) return;
    const request = ++operation.current;
    setBusy("read");
    setError("");
    try {
      const parsed = await readAssetImportFile(selected);
      if (request !== operation.current) return;
      setFile(parsed);
      setMapping(suggestAssetColumnMapping(parsed));
      setResult(null);
      setOnlyIssues(false);
      setPage(0);
      setStep(1);
    } catch (cause) {
      if (request === operation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not read this file. Choose a CSV or Excel workbook.",
        );
    } finally {
      if (request === operation.current) setBusy(null);
    }
  }

  async function download() {
    if (busy) return;
    const request = ++operation.current;
    setBusy("download");
    setError("");
    try {
      await downloadAssetTemplate();
    } catch {
      if (request === operation.current)
        setError("Could not download the template. Please try again.");
    } finally {
      if (request === operation.current) setBusy(null);
    }
  }

  function backToUpload() {
    operation.current++;
    setBusy(null);
    setStep(0);
    setError("");
    setResult(null);
  }

  async function review() {
    if (!file || busy || unmatched) return;
    const request = ++operation.current;
    setBusy("review");
    setError("");
    try {
      const reviewed = await validateMappedAssets(
        file,
        mapping,
        assets,
        members,
      );
      if (request !== operation.current) return;
      if (!reviewed.rows.length && reviewed.issues.length) {
        setError(
          reviewed.issues
            .map(
              (issue) =>
                `${issue.rowNumber ? `Row ${issue.rowNumber}: ` : ""}${issue.field ? `${issue.field}: ` : ""}${issue.message}`,
            )
            .join(" "),
        );
        return;
      }
      setResult(reviewed);
      setOnlyIssues(false);
      setPage(0);
      setStep(2);
    } catch (cause) {
      if (request === operation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not check these rows. Try again.",
        );
    } finally {
      if (request === operation.current) setBusy(null);
    }
  }

  function finishImport() {
    if (!result || !ready || busy) return;
    setBusy("import");
    setError("");
    try {
      importAssets(result.rows);
      toast("all assets are uploaded", "success");
      router.push("/tpm/assets");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save these assets. Try again.",
      );
      setBusy(null);
    }
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    if (event.dataTransfer.files.length !== 1) {
      setError("Choose one file at a time.");
      return;
    }
    void selectFile(event.dataTransfer.files[0]);
  }

  if (loading || assetsError) return <PreviewState />;

  return (
    <div className="tpm-import-workspace">
      <Link href="/tpm/assets" className="tpm-back-link">
        <ArrowLeft size={15} />
        Back to assets
      </Link>
      <header className="tpm-page-heading">
        <div>
          <h1>Import assets</h1>
          <p>Bring your equipment list into one place.</p>
        </div>
        <Link href="/tpm/assets" className="tpm-button">
          Cancel
        </Link>
      </header>

      <ol className="tpm-import-steps" aria-label="Import progress">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={
              index === step ? "is-current" : index < step ? "is-complete" : ""
            }
            aria-current={index === step ? "step" : undefined}
          >
            <span className="tpm-import-step-number">
              {index < step ? <Check size={15} /> : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label="Asset import file"
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          void selectFile(selected);
        }}
      />
      {error && (
        <p className="tpm-import-error" role="alert">
          {error}
        </p>
      )}

      <section className="tpm-import-panel" aria-busy={!!busy}>
        <div className="tpm-import-panel-heading">
          <div>
            <h2 ref={heading} tabIndex={-1}>
              {step === 0
                ? "Upload your file"
                : step === 1
                  ? "Match your columns"
                  : "Review assets"}
            </h2>
            <p>
              {step === 0
                ? "Choose a CSV or Excel file to get started."
                : step === 1
                  ? "Match the columns in your file to asset fields. Skip any columns you don’t need."
                  : "Check your rows before adding them to the asset register."}
            </p>
          </div>
          {step > 0 && (
            <button
              type="button"
              className="tpm-button"
              disabled={!!busy}
              onClick={backToUpload}
            >
              Replace file
            </button>
          )}
        </div>

        {step === 0 && (
          <div className="tpm-import-upload-body">
            <div className="tpm-import-template">
              <span className="tpm-import-template-icon">
                <FileSpreadsheet size={22} strokeWidth={1.5} />
              </span>
              <div className="tpm-import-template-copy">
                <strong>Start with a template</strong>
                <p>Preview the examples, then download a template to fill.</p>
              </div>
              <div className="tpm-import-template-actions">
                <AssetTemplatePreview disabled={!!busy} />
                <button
                  type="button"
                  className="tpm-button"
                  onClick={() => void download()}
                  disabled={!!busy}
                  aria-label="Download template"
                >
                  {busy === "download" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  Template
                </button>
              </div>
            </div>
            <div className="tpm-import-template-guide">
              <strong>How to fill your template</strong>
              <ul>
                <li>
                  Use one row per asset. Fill Asset name, Category, Workplace /
                  Gemba, and either Maintenance team or Maintenance owner.
                </li>
                <li>
                  Asset codes are optional. Leave them blank to generate codes
                  automatically. For hierarchy, use an existing asset code or a
                  code you entered in this file as the Parent asset code.
                </li>
                <li>
                  Fill your asset details below the headers. Keep the column
                  headers and use YYYY-MM-DD for dates.
                </li>
              </ul>
              <p>
                The Excel template includes header notes with field guidance and
                allowed values.
              </p>
            </div>
            <div
              className={`tpm-import-dropzone ${dragging ? "is-dragging" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                if (!busy) {
                  dragDepth.current++;
                  setDragging(true);
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (!dragDepth.current) setDragging(false);
              }}
              onDrop={dropFile}
            >
              <span className="tpm-import-upload-icon">
                {busy === "read" ? (
                  <Loader2 size={29} className="animate-spin" />
                ) : (
                  <UploadCloud size={29} strokeWidth={1.5} />
                )}
              </span>
              <h3>
                {busy === "read"
                  ? "Reading your file…"
                  : "Drag and drop your file here"}
              </h3>
              <p>
                CSV or XLSX · Up to {MAX_IMPORT_ROWS} rows ·{" "}
                {MAX_IMPORT_BYTES / (1024 * 1024)} MB
              </p>
              <button
                type="button"
                className="tpm-button primary"
                disabled={!!busy}
                onClick={() => fileInput.current?.click()}
              >
                Choose file
              </button>
            </div>
          </div>
        )}

        {step > 0 && file && (
          <div className="tpm-import-file-strip">
            <FileSpreadsheet size={18} />
            <strong>{file.fileName}</strong>
            <span>{file.rows.length} rows</span>
            {file.sheetName !== "CSV" && <span>{file.sheetName}</span>}
          </div>
        )}

        {step === 1 && file && (
          <>
            <div className="tpm-import-match-toolbar">
              <span>
                <strong>{matched}</strong> matched
                {unmatched > 0
                  ? ` · ${unmatched} to match or skip`
                  : " · All columns reviewed"}
              </span>
              {unmatched > 0 && (
                <button
                  className="tpm-text-button"
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    setMapping((current) =>
                      Object.fromEntries(
                        file.headers.map((_, index) => [
                          index,
                          current[index] ?? "",
                        ]),
                      ),
                    );
                    setError("");
                  }}
                >
                  Skip unmatched columns
                </button>
              )}
            </div>
            <div className="tpm-import-table-scroll">
              <table className="tpm-import-table tpm-import-mapping">
                <thead>
                  <tr>
                    <th>Column in your file</th>
                    <th>Example value</th>
                    <th>Asset field</th>
                    <th>
                      <span className="sr-only">Match status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {file.headers.map((header, index) => {
                    const value = mapping[index];
                    const example =
                      file.rows.find((row) => row.values[index]?.trim())
                        ?.values[index] ?? "—";
                    return (
                      <tr
                        key={index}
                        className={value === undefined ? "is-unmatched" : ""}
                      >
                        <td>
                          <strong>{header || `Column ${index + 1}`}</strong>
                        </td>
                        <td className="tpm-import-example">
                          <span title={example}>{example}</span>
                        </td>
                        <td>
                          <div className="tpm-import-mapping-select">
                            <ArrowRight size={15} aria-hidden="true" />
                            <select
                              disabled={!!busy}
                              aria-label={`Map column ${index + 1}: ${header || "Unnamed"}`}
                              value={value ?? "__unmatched__"}
                              onChange={(event) => {
                                setMapping((current) => ({
                                  ...current,
                                  [index]: event.target.value,
                                }));
                                setError("");
                              }}
                            >
                              <option value="__unmatched__" disabled>
                                Choose an asset field
                              </option>
                              <option value="">Skip this column</option>
                              {ASSET_IMPORT_COLUMNS.map((column) => (
                                <option
                                  key={column.key}
                                  value={column.key}
                                  disabled={
                                    usedFields.has(column.key) &&
                                    value !== column.key
                                  }
                                >
                                  {column.header}
                                  {column.required ? " *" : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td>
                          {value ? (
                            <CheckCircle2
                              size={17}
                              className="tpm-import-matched-icon"
                              aria-label="Matched"
                            />
                          ) : (
                            <span className="tpm-import-match-status">
                              {value === "" ? "Skipped" : "Unmatched"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tpm-import-panel-footer">
              <p>
                {loadingMembers
                  ? "Loading organization members…"
                  : "Blank asset codes will be generated when you import."}
              </p>
              <div className="tpm-actions">
                <button
                  type="button"
                  className="tpm-button"
                  onClick={backToUpload}
                  disabled={!!busy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="tpm-button primary"
                  disabled={
                    !!busy ||
                    !!unmatched ||
                    (usedFields.has("operatorId") && loadingMembers)
                  }
                  onClick={() => void review()}
                >
                  {busy === "review" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : null}
                  Review assets
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}

        {step === 2 && result && (
          <>
            <div className="tpm-import-review-toolbar">
              <div
                className="tpm-import-tabs"
                role="group"
                aria-label="Review rows"
              >
                <button
                  type="button"
                  aria-pressed={!onlyIssues}
                  onClick={() => {
                    setOnlyIssues(false);
                    setPage(0);
                  }}
                >
                  All rows <span>{result.rows.length}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={onlyIssues}
                  onClick={() => {
                    setOnlyIssues(true);
                    setPage(0);
                  }}
                >
                  Needs attention <span>{issueRows.size}</span>
                </button>
              </div>
              <span
                className={`tpm-import-ready ${ready ? "is-ready" : ""}`}
                role="status"
              >
                {ready ? (
                  <>
                    <CheckCircle2 size={16} />
                    {result.rows.length} assets ready to import
                  </>
                ) : (
                  "Fix the highlighted rows before importing"
                )}
              </span>
            </div>
            {result.issues
              .filter((issue) => !issue.rowNumber)
              .map((issue, index) => (
                <p className="tpm-import-inline-error" role="alert" key={index}>
                  {issue.message}
                </p>
              ))}
            <div className="tpm-import-table-scroll">
              <table className="tpm-import-table tpm-import-review">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Asset name</th>
                    <th>Asset code</th>
                    <th>Asset level</th>
                    <th>Parent asset code</th>
                    <th>Category</th>
                    <th>Workplace / Gemba</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const issues = result.issues.filter(
                      (issue) => issue.rowNumber === row.rowNumber,
                    );
                    return (
                      <tr
                        key={row.rowNumber}
                        className={issues.length ? "has-issues" : ""}
                      >
                        <td>{row.rowNumber}</td>
                        <td>
                          <strong>{row.input.name || "Missing name"}</strong>
                          {issues.length > 0 && (
                            <ul className="tpm-import-row-errors">
                              {issues.map((issue, index) => (
                                <li key={index}>
                                  {issue.field ? `${issue.field}: ` : ""}
                                  {issue.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>
                          {row.input.code || (
                            <span className="tpm-import-auto-code">
                              Auto-generated
                            </span>
                          )}
                        </td>
                        <td>{row.input.level}</td>
                        <td>{row.parentCode || "Top level"}</td>
                        <td>{row.input.category || "—"}</td>
                        <td>{row.input.location || "—"}</td>
                        <td>
                          <span
                            className={`tpm-import-status ${issues.length ? "has-issues" : ""}`}
                          >
                            {issues.length ? "Needs attention" : "Ready"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibleRows.length && (
                    <tr>
                      <td colSpan={8} className="tpm-import-empty">
                        No rows need attention.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {reviewRows.length > PAGE_SIZE && (
              <div className="tpm-import-pagination">
                <span>
                  {page * PAGE_SIZE + 1}–
                  {Math.min((page + 1) * PAGE_SIZE, reviewRows.length)} of{" "}
                  {reviewRows.length} rows
                </span>
                <div>
                  <button
                    type="button"
                    className="tpm-button"
                    aria-label="Previous rows"
                    disabled={!page}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <button
                    type="button"
                    className="tpm-button"
                    aria-label="Next rows"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
            <div className="tpm-import-panel-footer">
              <p>
                {ready
                  ? "Your assets will be added when you select Import assets."
                  : "Correct the file and upload again, or go back to adjust column matching."}
              </p>
              <div className="tpm-actions">
                <button
                  type="button"
                  className="tpm-button"
                  disabled={!!busy}
                  onClick={() => {
                    setStep(1);
                    setError("");
                  }}
                >
                  Back to matching
                </button>
                <button
                  type="button"
                  className="tpm-button primary"
                  disabled={!ready || !!busy}
                  onClick={finishImport}
                >
                  {busy === "import" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : null}
                  Import {result.rows.length} assets
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
