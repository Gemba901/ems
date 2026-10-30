"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Cog,
  Factory,
  Layers3,
  Network,
  Settings2,
  Workflow,
} from "lucide-react";
import { CriticalityPill } from "./AssetDetails";
import {
  buildAssetHierarchy,
  type AssetHierarchyNode,
} from "./asset-hierarchy";
import type { Asset, AssetLevel } from "./asset-preview";
import "./asset-hierarchy.css";

const LEVEL_ICONS = {
  Plant: Building2,
  Area: Layers3,
  Line: Workflow,
  Station: Settings2,
  Equipment: Factory,
  Component: Cog,
} satisfies Record<AssetLevel, typeof Factory>;

export function AssetHierarchy({
  assets,
  matches,
  sort,
  hasFilters,
  demoLoaded,
  onLoadDemo,
}: {
  assets: Asset[];
  matches: Asset[];
  sort: string;
  hasFilters: boolean;
  demoLoaded: boolean;
  onLoadDemo: () => void;
}) {
  const hierarchy = useMemo(
    () =>
      buildAssetHierarchy(
        assets,
        new Set(matches.map((asset) => asset.id)),
        sort,
      ),
    [assets, matches, sort],
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(hasFilters ? hierarchy.branches : []),
  );
  const allExpanded = [...hierarchy.branches].every((id) => expanded.has(id));
  const allCollapsed = [...hierarchy.branches].every((id) => !expanded.has(id));

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(node: AssetHierarchyNode, depth: number) {
    const { asset, children } = node;
    const open = expanded.has(asset.id);
    const level = asset.level ?? "Equipment";
    const Icon = LEVEL_ICONS[level];
    const childrenId = `asset-children-${asset.id}`;
    return (
      <li
        key={asset.id}
        className="tpm-hierarchy-node"
        data-asset-id={asset.id}
      >
        <div
          className={`tpm-hierarchy-row ${node.matches ? "" : "is-context"}`}
          style={{ "--asset-depth": Math.min(depth, 6) } as CSSProperties}
        >
          <div className="tpm-hierarchy-identity">
            {children.length ? (
              <button
                type="button"
                className="tpm-hierarchy-toggle"
                aria-label={`${open ? "Collapse" : "Expand"} ${asset.name}`}
                aria-expanded={open}
                aria-controls={childrenId}
                onClick={() => toggle(asset.id)}
              >
                {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
              </button>
            ) : (
              <span className="tpm-hierarchy-leaf" aria-hidden="true">
                <span />
              </span>
            )}
            <span className={`tpm-hierarchy-icon ${depth ? "" : "is-root"}`}>
              <Icon size={18} strokeWidth={1.6} />
            </span>
            <div className="tpm-hierarchy-name">
              <Link href={`/tpm/assets/${asset.id}`}>{asset.name}</Link>
              <div className="tpm-hierarchy-meta">
                <span>{asset.code}</span>
                {children.length > 0 && (
                  <span>
                    {children.length} sub-
                    {children.length === 1 ? "asset" : "assets"}
                  </span>
                )}
                {!node.matches && (
                  <span className="tpm-hierarchy-context">Parent context</span>
                )}
                {node.issue && (
                  <span className="tpm-hierarchy-issue">
                    {node.issue === "missing-parent"
                      ? "Parent unavailable"
                      : "Check parent relationship"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="tpm-hierarchy-level">{level}</span>
          <span className="tpm-hierarchy-usage">
            <span
              className={`tpm-pill ${asset.usage === "Active" ? "green" : asset.usage === "Intermittent" ? "amber" : "gray"}`}
            >
              <span className="tpm-status-dot" />
              {asset.usage}
            </span>
          </span>
          <span className="tpm-hierarchy-criticality">
            <CriticalityPill value={asset.criticality} />
          </span>
          <Link
            href={`/tpm/assets/${asset.id}`}
            className="tpm-hierarchy-open"
            aria-label={`View ${asset.name}`}
          >
            <ChevronRight size={16} />
          </Link>
        </div>
        {children.length > 0 && open && (
          <ul
            id={childrenId}
            className="tpm-hierarchy-children"
            aria-label={`Sub-assets of ${asset.name}`}
          >
            {children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <section className="tpm-hierarchy" aria-label="Asset hierarchy">
      <div className="tpm-hierarchy-toolbar">
        <div className="tpm-hierarchy-title">
          <span>
            <Network size={19} />
          </span>
          <div>
            <h3>Asset hierarchy</h3>
            <p>
              {matches.length} {matches.length === 1 ? "asset" : "assets"}
              {hierarchy.contextCount
                ? ` + ${hierarchy.contextCount} parent${hierarchy.contextCount === 1 ? "" : "s"} for context`
                : ` · ${hierarchy.roots.length} at top level`}
            </p>
          </div>
        </div>
        <div className="tpm-hierarchy-actions">
          <button
            type="button"
            className="tpm-button"
            disabled={allExpanded}
            onClick={() => setExpanded(new Set(hierarchy.branches))}
          >
            <ChevronsUpDown size={14} />
            Expand all
          </button>
          <button
            type="button"
            className="tpm-button"
            disabled={allCollapsed}
            onClick={() => setExpanded(new Set())}
          >
            <ChevronsDownUp size={14} />
            Collapse all
          </button>
        </div>
      </div>
      {!demoLoaded && (
        <div className="tpm-hierarchy-demo">
          <div>
            <strong>Explore a sample hierarchy</strong>
            <p>Nairobi Manufacturing Plant · 6 levels · 8 sample assets</p>
          </div>
          <button type="button" className="tpm-button" onClick={onLoadDemo}>
            <Network size={15} /> Load demo hierarchy
          </button>
        </div>
      )}
      {!assets.some((asset) => asset.parentId) && (
        <p className="tpm-hierarchy-tip">
          Build your hierarchy by choosing a Parent asset when creating or
          editing, or use Parent asset code in your upload.
        </p>
      )}
      <div className="tpm-hierarchy-columns" aria-hidden="true">
        <span>Asset name / code</span>
        <span>Asset level</span>
        <span>Usage status</span>
        <span>Criticality</span>
        <span />
      </div>
      <ul className="tpm-hierarchy-roots" aria-label="Asset hierarchy roots">
        {hierarchy.roots.map((node) => renderNode(node, 0))}
      </ul>
    </section>
  );
}
