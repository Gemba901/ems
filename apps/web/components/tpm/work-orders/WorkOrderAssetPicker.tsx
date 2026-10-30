"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Factory, Search, X } from "lucide-react";
import {
  buildAssetHierarchy,
  type AssetHierarchyNode,
} from "../asset-hierarchy";
import type { Asset } from "../asset-preview";

export function WorkOrderAssetPicker({
  assets,
  value,
  onChange,
  error,
  disabled = false,
}: {
  assets: Asset[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState(value);
  const [expanded, setExpanded] = useState<Set<string> | null>(new Set());
  const selected = assets.find((asset) => asset.id === value);
  const staged = assets.find((asset) => asset.id === selection);
  const canSelect = (asset: Asset) =>
    asset.stage === "Registered" && asset.usage !== "Retired";
  const tree = useMemo(
    () =>
      buildAssetHierarchy(
        assets,
        new Set(
          assets
            .filter((asset) =>
              `${asset.name} ${asset.code}`
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
            )
            .map((asset) => asset.id),
        ),
        "name",
      ),
    [assets, search],
  );
  const branches = expanded ?? tree.branches;

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);

  function close() {
    dialog.current?.close();
  }
  function node(item: AssetHierarchyNode) {
    const { asset, children } = item;
    const isExpanded = branches.has(asset.id);
    const selectable = canSelect(asset);
    return (
      <li key={asset.id}>
        <div
          className={`wo-asset-node ${selection === asset.id ? "is-selected" : ""}`}
        >
          {children.length ? (
            <button
              type="button"
              className="wo-tree-toggle"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${asset.name}`}
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current ?? tree.branches);
                  if (next.has(asset.id)) next.delete(asset.id);
                  else next.add(asset.id);
                  return next;
                })
              }
            >
              {isExpanded ? (
                <ChevronDown size={17} />
              ) : (
                <ChevronRight size={17} />
              )}
            </button>
          ) : (
            <span className="wo-tree-spacer" />
          )}
          <label>
            <input
              type="radio"
              name={`${uid}-asset`}
              checked={selection === asset.id}
              disabled={!selectable}
              onChange={() => setSelection(asset.id)}
              aria-label={`${asset.name}, ${asset.code}`}
            />
            <Factory size={18} />
            <span>
              <small>{asset.level ?? "Equipment"}</small>
              <strong>{asset.name}</strong>
              <small>
                {asset.code}
                {!selectable
                  ? ` · ${asset.stage === "Draft" ? "Draft" : "Retired"} — unavailable`
                  : ""}
              </small>
            </span>
          </label>
        </div>
        {!!children.length && isExpanded && <ul>{children.map(node)}</ul>}
      </li>
    );
  }
  return (
    <div className="wo-field">
      <label htmlFor={`${uid}-trigger`}>
        Asset <span aria-label="required">*</span>
      </label>
      <button
        type="button"
        ref={trigger}
        id={`${uid}-trigger`}
        className="wo-asset-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-invalid={!!error}
        aria-describedby={error ? `${uid}-error` : undefined}
        onClick={() => {
          setSearch("");
          setSelection(value);
          setExpanded(new Set());
          setOpen(true);
          dialog.current?.showModal();
          searchRef.current?.focus();
        }}
      >
        <Factory size={19} />
        <span>
          <strong>{selected?.name ?? "Select an asset"}</strong>
          {selected && (
            <small>
              {selected.code} · {selected.level ?? "Equipment"}
            </small>
          )}
        </span>
        <ChevronRight size={17} />
      </button>
      {error && (
        <p className="wo-form-error" id={`${uid}-error`}>
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        className="wo-asset-dialog"
        aria-labelledby={`${uid}-title`}
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
            ),
          ].filter((element) => element.getClientRects().length);
          if (event.shiftKey && document.activeElement === items[0]) {
            event.preventDefault();
            items.at(-1)?.focus();
          } else if (
            !event.shiftKey &&
            document.activeElement === items.at(-1)
          ) {
            event.preventDefault();
            items[0]?.focus();
          }
        }}
      >
        <header>
          <div>
            <h2 id={`${uid}-title`}>Select an asset</h2>
            <p>
              Browse your hierarchy to choose the equipment for this work order.
            </p>
          </div>
          <button
            type="button"
            className="wo-icon-button"
            aria-label="Close asset selector"
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div className="wo-tree-search">
          <Search size={17} />
          <input
            ref={searchRef}
            aria-label="Search asset hierarchy"
            placeholder="Search asset name or code…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setExpanded(event.target.value.trim() ? null : new Set());
            }}
          />
        </div>
        <div className="wo-asset-tree">
          {tree.roots.length ? (
            <ul>{tree.roots.map(node)}</ul>
          ) : (
            <p className="wo-muted">No matching assets found.</p>
          )}
        </div>
        <footer>
          <span>
            {staged
              ? `${staged.name} · ${staged.code}`
              : "Choose a registered, non-retired asset."}
          </span>
          <button type="button" className="tpm-button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="tpm-button tpm-button-primary"
            disabled={!staged || !canSelect(staged)}
            onClick={() => {
              onChange(selection);
              close();
            }}
          >
            Select asset
          </button>
        </footer>
      </dialog>
    </div>
  );
}
