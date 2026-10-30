"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Network, Search, X } from "lucide-react";
import { useAssets } from "./AssetsProvider";
import {
  buildAssetHierarchy,
  type AssetHierarchyNode,
} from "./asset-hierarchy";
import { hasHierarchyDemoAssets } from "./asset-hierarchy-demo";
import type { Asset } from "./asset-preview";
import "./parent-asset-picker.css";

type ParentAssetPickerProps = {
  assets: Asset[];
  value: string;
  editingId?: string;
  onChange: (id: string) => void;
  error?: string;
};

export function ParentAssetPicker({
  assets,
  value,
  editingId,
  onChange,
  error,
}: ParentAssetPickerProps) {
  const { addHierarchyDemo } = useAssets();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogId = useId();
  const radioName = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState(value);
  // null reveals search results; an empty set keeps the unfiltered tree collapsed.
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(
    () => new Set(),
  );
  const [demoError, setDemoError] = useState("");
  const [demoNotice, setDemoNotice] = useState("");
  const byId = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const excluded = useMemo(() => {
    const byParent = new Map<string, string[]>();
    for (const asset of assets) {
      const children = byParent.get(asset.parentId) ?? [];
      children.push(asset.id);
      byParent.set(asset.parentId, children);
    }
    const ids = new Set<string>();
    const pending = editingId ? [editingId] : [];
    while (pending.length) {
      const id = pending.pop()!;
      if (ids.has(id)) continue;
      ids.add(id);
      pending.push(...(byParent.get(id) ?? []));
    }
    return ids;
  }, [assets, editingId]);
  const needle = search.trim().toLowerCase();
  const hierarchy = useMemo(() => {
    const matches = new Set(
      assets
        .filter(
          (asset) =>
            !needle ||
            `${asset.name} ${asset.code}`.toLowerCase().includes(needle),
        )
        .map((asset) => asset.id),
    );
    return buildAssetHierarchy(assets, matches, "name");
  }, [assets, needle]);
  const expandedBranches = expandedIds ?? hierarchy.branches;
  const selected = byId.get(value);
  const stagedAsset = byId.get(staged);
  const validSelection = !staged || (!!stagedAsset && !excluded.has(staged));

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  function pathFor(id: string) {
    const names: string[] = [];
    const visited = new Set<string>();
    let current = byId.get(id);
    while (current && !visited.has(current.id)) {
      names.unshift(current.name);
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
    return names.join(" / ");
  }

  function showPicker() {
    setStaged(value);
    setSearch("");
    setExpandedIds(new Set());
    setDemoError("");
    setDemoNotice("");
    dialogRef.current?.showModal();
    setOpen(true);
    searchRef.current?.focus();
  }

  function renderNode(node: AssetHierarchyNode) {
    const { asset, children } = node;
    const disabled = excluded.has(asset.id);
    const expanded = expandedBranches.has(asset.id);
    return (
      <li key={asset.id} className="tpm-parent-node">
        <div
          className={`tpm-parent-node-row ${staged === asset.id ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
        >
          {children.length ? (
            <button
              type="button"
              className="tpm-parent-expand"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${asset.name}`}
              aria-expanded={expanded}
              onClick={() =>
                setExpandedIds((current) => {
                  const next = new Set(current ?? hierarchy.branches);
                  if (next.has(asset.id)) next.delete(asset.id);
                  else next.add(asset.id);
                  return next;
                })
              }
            >
              {expanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          ) : (
            <span className="tpm-parent-expand-spacer" />
          )}
          <label className="tpm-parent-node-label">
            <input
              type="radio"
              name={radioName}
              value={asset.id}
              checked={staged === asset.id}
              disabled={disabled}
              onChange={() => setStaged(asset.id)}
              aria-label={`${asset.name}, ${asset.level ?? "Equipment"}, ${asset.code}`}
            />
            <span className="tpm-parent-node-icon">
              <Network size={17} />
            </span>
            <span className="tpm-parent-node-text">
              <span className="tpm-parent-node-level">
                {asset.level ?? "Equipment"}
              </span>
              <strong>{asset.name}</strong>
              <small>
                {asset.code}
                {disabled
                  ? asset.id === editingId
                    ? " · Current asset — cannot select"
                    : " · Child of this asset — cannot select"
                  : node.issue
                    ? " · Check saved hierarchy"
                    : ""}
              </small>
            </span>
          </label>
        </div>
        {children.length > 0 && expanded && <ul>{children.map(renderNode)}</ul>}
      </li>
    );
  }

  return (
    <div className={`tpm-field ${error ? "has-error" : ""}`}>
      <label htmlFor="asset-parentId">
        Parent asset <span className="tpm-optional">Optional</span>
      </label>
      <button
        ref={triggerRef}
        type="button"
        id="asset-parentId"
        className="tpm-parent-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        data-invalid={!!error}
        aria-describedby={error ? "error-parentId" : "hint-parentId"}
        onClick={showPicker}
      >
        <Network size={18} />
        <span>
          <strong>
            {selected?.name ||
              (value ? "Choose another parent" : "Choose parent asset")}
          </strong>
          {selected && (
            <small>
              {selected.level ?? "Equipment"} · {selected.code}
            </small>
          )}
        </span>
        <ChevronRight size={16} />
      </button>
      {error ? (
        <p className="tpm-field-error" id="error-parentId">
          {error}
        </p>
      ) : (
        <p className="tpm-field-hint tpm-parent-picker-hint" id="hint-parentId">
          {selected
            ? `Placed under ${pathFor(value)}.`
            : value
              ? "The saved parent is unavailable. Choose another parent or top level."
              : "Leave unassigned to keep this asset at the top level."}
        </p>
      )}
      <dialog
        ref={dialogRef}
        id={dialogId}
        className="tpm-parent-dialog"
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={`${dialogId}-description`}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target instanceof HTMLInputElement)
            event.preventDefault();
        }}
      >
        <header className="tpm-parent-dialog-heading">
          <span className="tpm-parent-dialog-icon">
            <Network size={23} />
          </span>
          <div>
            <h2 id={`${dialogId}-title`}>Select parent asset</h2>
            <p id={`${dialogId}-description`}>
              Explore your asset hierarchy and choose where this asset belongs.
            </p>
          </div>
          <button
            type="button"
            className="tpm-parent-close"
            aria-label="Close parent selector"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={19} />
          </button>
        </header>
        <div className="tpm-parent-toolbar">
          <label className="tpm-parent-search">
            <Search size={17} />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search parent assets"
              placeholder="Search by asset name or code"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setExpandedIds(event.target.value.trim() ? null : new Set());
              }}
            />
          </label>
          <div className="tpm-parent-tree-actions">
            <span>
              {hierarchy.total} of {assets.length} assets
            </span>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set(hierarchy.branches))}
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set())}
            >
              Collapse all
            </button>
          </div>
          {!hasHierarchyDemoAssets(assets) && (
            <div className="tpm-parent-demo">
              <span>
                Explore an example plant hierarchy.
                <small>Adds eight sample assets to this preview.</small>
              </span>
              <button
                type="button"
                onClick={() => {
                  try {
                    addHierarchyDemo();
                    setSearch("");
                    setExpandedIds(new Set());
                    setDemoError("");
                    setDemoNotice(
                      "Demo hierarchy added. Choose a parent from the tree below.",
                    );
                  } catch (cause) {
                    setDemoNotice("");
                    setDemoError(
                      cause instanceof Error
                        ? cause.message
                        : "Could not load the demo hierarchy.",
                    );
                  }
                }}
              >
                Load demo hierarchy
              </button>
            </div>
          )}
          {demoNotice && (
            <p className="tpm-parent-demo-success" role="status">
              {demoNotice}
            </p>
          )}
          {demoError && (
            <p className="tpm-field-error" role="alert">
              {demoError}
            </p>
          )}
          {editingId && (
            <p className="tpm-parent-exclusion-note">
              This asset and its children are shown for context and cannot be
              selected as its parent.
            </p>
          )}
        </div>
        <div
          className="tpm-parent-options"
          role="radiogroup"
          aria-label="Choose a parent asset"
        >
          <label
            className={`tpm-parent-top-level ${staged === "" ? "is-selected" : ""}`}
          >
            <input
              type="radio"
              name={radioName}
              value=""
              checked={staged === ""}
              onChange={() => setStaged("")}
            />
            <span>
              <strong>No parent — top-level asset</strong>
              <small>Place this asset at the root of your hierarchy.</small>
            </span>
          </label>
          {hierarchy.roots.length ? (
            <ul className="tpm-parent-tree">
              {hierarchy.roots.map(renderNode)}
            </ul>
          ) : (
            <div className="tpm-parent-empty">
              <Network size={28} />
              <strong>
                {needle ? "No matching assets" : "No assets to select yet"}
              </strong>
              <p>
                {needle
                  ? "Try another asset name or code."
                  : "Keep this asset at the top level or load the demo hierarchy."}
              </p>
            </div>
          )}
        </div>
        <footer className="tpm-parent-dialog-footer">
          <div>
            <span>Selected parent</span>
            <strong>
              {stagedAsset
                ? pathFor(staged)
                : staged
                  ? "Selection unavailable"
                  : "Top-level asset"}
            </strong>
            {!validSelection && (
              <small>Choose an available parent or top level.</small>
            )}
          </div>
          <div className="tpm-actions">
            <button
              type="button"
              className="tpm-button"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
            <button
              type="button"
              className="tpm-button primary"
              disabled={!validSelection}
              onClick={() => {
                if (!validSelection) return;
                onChange(staged);
                dialogRef.current?.close();
              }}
            >
              Use selected parent
            </button>
          </div>
        </footer>
      </dialog>
    </div>
  );
}
