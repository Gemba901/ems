"use client";

import { useId, useRef, useState } from "react";
import { Download, FileText, Paperclip, X } from "lucide-react";
import type { WorkOrderAttachment } from "./work-order-types";
import "./work-order-documents.css";

const MAX_FILES = 5;
const MAX_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 3 * MAX_BYTES;
const TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

function dataBytes(dataUrl: string) {
  const body = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return (
    Math.floor((body.length * 3) / 4) -
    (body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0)
  );
}

export function WorkOrderDocuments({
  value,
  onChange,
  readOnly = false,
  label = "Documents",
  helpText = "Attach manuals, drawings or SOPs. PDF, PNG, JPG or WebP · Up to 5 files · 1 MB each, 3 MB total.",
  onBusyChange,
}: {
  value: WorkOrderAttachment[];
  onChange: (value: WorkOrderAttachment[]) => void;
  readOnly?: boolean;
  label?: string;
  helpText?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length || reading || readOnly) return;
    setError("");
    const selected = Array.from(files);
    if (selected.length + value.length > MAX_FILES) {
      setError(
        "Add up to 5 documents. Remove a document before adding another.",
      );
      return;
    }
    if (
      selected.some(
        (file) =>
          !TYPES.includes(file.type) ||
          !file.size ||
          file.size > MAX_BYTES ||
          file.name.length > 200,
      )
    ) {
      setError(
        "Choose a PDF, PNG, JPG or WebP file up to 1 MB, with a filename of up to 200 characters.",
      );
      return;
    }
    if (
      selected.reduce((total, file) => total + file.size, 0) +
        value.reduce((total, file) => total + dataBytes(file.dataUrl), 0) >
      MAX_TOTAL_BYTES
    ) {
      setError("Keep the combined document size within 3 MB.");
      return;
    }
    setReading(true);
    onBusyChange?.(true);
    try {
      const documents = await Promise.all(
        selected.map(
          (file) =>
            new Promise<WorkOrderAttachment>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  dataUrl: String(reader.result),
                });
              reader.onerror = () =>
                reject(
                  new Error("Could not read the document. Please try again."),
                );
              reader.readAsDataURL(file);
            }),
        ),
      );
      onChange([...value, ...documents]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add these documents.",
      );
    } finally {
      setReading(false);
      onBusyChange?.(false);
    }
  }

  function download(document: WorkOrderAttachment) {
    try {
      const match =
        /^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          document.dataUrl,
        );
      if (!match) throw new Error("This document cannot be downloaded.");
      const bytes = Uint8Array.from(atob(match[2]), (char) =>
        char.charCodeAt(0),
      );
      const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.name.replace(/[\\/:*?"<>|]/g, "_");
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not download the document.",
      );
    }
  }

  return (
    <div className="wo-documents">
      <p className="wo-field-label" id={`${id}-label`}>
        {label}
      </p>
      {!!value.length && (
        <ul className="wo-document-list">
          {value.map((document) => (
            <li key={document.id}>
              <FileText size={20} aria-hidden="true" />
              <span className="wo-document-name" title={document.name}>
                {document.name}
                <small>
                  {Math.max(1, Math.round(dataBytes(document.dataUrl) / 1024))}{" "}
                  KB
                </small>
              </span>
              <button
                type="button"
                className="tpm-button"
                aria-label={`Download ${document.name}`}
                onClick={() => download(document)}
              >
                <Download size={16} />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="tpm-button"
                  aria-label={`Remove document ${document.name}`}
                  disabled={reading}
                  onClick={() =>
                    onChange(value.filter((item) => item.id !== document.id))
                  }
                >
                  <X size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? (
        !value.length && <p className="wo-muted">No documents attached.</p>
      ) : (
        <>
          <input
            ref={input}
            id={id}
            type="file"
            hidden
            multiple
            disabled={reading}
            accept="application/pdf,image/png,image/jpeg,image/webp"
            aria-labelledby={`${id}-label`}
            onChange={(event) => {
              void add(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="tpm-button"
            disabled={reading || value.length >= MAX_FILES}
            onClick={() => input.current?.click()}
          >
            <Paperclip size={16} />
            {reading ? "Adding documents…" : "Add documents"}
          </button>
          <p className="wo-help">{helpText}</p>
        </>
      )}
      {error && (
        <p className="wo-form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
