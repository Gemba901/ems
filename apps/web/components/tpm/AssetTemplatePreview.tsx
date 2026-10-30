"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, FileSpreadsheet, X } from "lucide-react";
import { assetOptionLabel } from "./asset-option-labels";
import {
  ASSET_IMPORT_COLUMNS,
  ASSET_TEMPLATE_SAMPLE_ROWS,
} from "./asset-import";

export function AssetTemplatePreview({ disabled }: { disabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tpm-button"
        disabled={disabled}
        aria-label="Preview sample template"
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
          closeButton.current?.focus();
        }}
      >
        <Eye size={15} />
        Preview sample
      </button>
      <dialog
        ref={dialog}
        id={id}
        className="tpm-template-preview"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [tabindex="0"]',
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
      >
        <header className="tpm-template-preview-heading">
          <span className="tpm-import-template-icon" aria-hidden="true">
            <FileSpreadsheet size={22} strokeWidth={1.5} />
          </span>
          <div>
            <h2 id={`${id}-title`}>Sample template preview</h2>
            <p id={`${id}-description`}>
              Use these examples as a guide when filling your template.
            </p>
          </div>
          <button
            ref={closeButton}
            type="button"
            className="tpm-icon-button"
            aria-label="Close sample preview"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <div className="tpm-template-preview-body">
          <p className="tpm-template-preview-summary">
            <strong>
              {ASSET_TEMPLATE_SAMPLE_ROWS.length} sample assets ·{" "}
              {ASSET_IMPORT_COLUMNS.length} fields
            </strong>
            <span>Scroll sideways to see all fields.</span>
          </p>
          <div
            className="tpm-template-preview-scroll"
            role="region"
            aria-label="Sample asset data"
            tabIndex={0}
          >
            <table className="tpm-import-table tpm-template-preview-table">
              <caption className="sr-only">
                Example asset rows in the same column order as the template.
              </caption>
              <thead>
                <tr>
                  {ASSET_IMPORT_COLUMNS.map((column) => (
                    <th key={column.key} scope="col" title={column.help}>
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASSET_TEMPLATE_SAMPLE_ROWS.map((row) => (
                  <tr key={row.name}>
                    {ASSET_IMPORT_COLUMNS.map((column) => (
                      <td key={column.key}>
                        {assetOptionLabel(
                          column.key,
                          row[column.key] ?? "",
                        ) || (
                          <span className="tpm-template-preview-blank">
                            {column.key === "code" ? "Leave blank" : "—"}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tpm-template-preview-note">
            A blank Asset code is generated on upload. Parent asset code links
            the hydraulic pump to the injection moulding machine.
          </p>
        </div>
        <footer className="tpm-template-preview-footer">
          <button
            type="button"
            className="tpm-button primary"
            onClick={() => dialog.current?.close()}
          >
            Done
          </button>
        </footer>
      </dialog>
    </>
  );
}
