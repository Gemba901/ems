"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { WorkOrderAttachment } from "./work-order-types";
import "./work-order-list-form.css";

const MAX_PHOTOS = 3;
const MAX_BYTES = 500 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export function WorkOrderAttachments({
  value,
  onChange,
  readOnly = false,
  label = "Photos / attachments",
  onBusyChange,
}: {
  value: WorkOrderAttachment[];
  onChange: (value: WorkOrderAttachment[]) => void;
  readOnly?: boolean;
  label?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length || reading || readOnly) return;
    setError("");
    const selected = [...files];
    if (selected.length + value.length > MAX_PHOTOS) {
      setError("Add up to 3 photos. Remove a photo before adding another.");
      return;
    }
    if (
      selected.some(
        (file) => !TYPES.includes(file.type) || file.size > MAX_BYTES,
      )
    ) {
      setError("Choose PNG, JPG or WebP photos, no larger than 500 KB each.");
      return;
    }
    setReading(true);
    onBusyChange?.(true);
    try {
      const photos = await Promise.all(
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
                  new Error("Could not read this photo. Please try again."),
                );
              reader.readAsDataURL(file);
            }),
        ),
      );
      onChange([...value, ...photos]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add these photos.",
      );
    } finally {
      setReading(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="wo-attachments">
      <p className="wo-field-label" id={`${id}-label`}>
        {label}
      </p>
      {!!value.length && (
        <div className="wo-photo-grid">
          {value.map((photo) => (
            <figure key={photo.id}>
              {/* Local data URLs are already bounded in size and require no image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.dataUrl} alt={photo.name} />
              <figcaption title={photo.name}>{photo.name}</figcaption>
              {!readOnly && (
                <button
                  type="button"
                  aria-label={`Remove ${photo.name}`}
                  disabled={reading}
                  onClick={() =>
                    onChange(value.filter((item) => item.id !== photo.id))
                  }
                >
                  <X size={14} />
                </button>
              )}
            </figure>
          ))}
        </div>
      )}
      {readOnly ? (
        !value.length && <p className="wo-muted">No photos attached.</p>
      ) : (
        <>
          <input
            ref={input}
            id={id}
            type="file"
            hidden
            disabled={reading}
            accept="image/png,image/jpeg,image/webp"
            multiple
            aria-labelledby={`${id}-label`}
            onChange={(event) => {
              void add(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="tpm-button"
            disabled={reading || value.length >= MAX_PHOTOS}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={16} />
            {reading ? "Adding photos…" : "Add photos"}
          </button>
          <p className="wo-help">
            Up to 3 photos · PNG, JPG or WebP · 500 KB each
          </p>
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
