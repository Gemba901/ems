"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownAZ,
  ChevronRight,
  Download,
  Factory,
  LayoutGrid,
  List,
  ListFilter,
  Network,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useAssets } from "./AssetsProvider";
import { useToast } from "@/contexts/toast.context";
import { hasHierarchyDemoAssets } from "./asset-hierarchy-demo";
import { AssetSummary } from "./AssetSummary";
import { AssetHierarchy } from "./AssetHierarchy";
import { CriticalityPill, PreviewState } from "./AssetDetails";
import { ECONOMIC_IMPACT, USAGE, exportAssets } from "./asset-preview";
import { assetOptionLabel } from "./asset-option-labels";
import "./asset-list.css";

export function AssetsWorkspace() {
  const { assets, loading, error, addHierarchyDemo } = useAssets();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [usage, setUsage] = useState("");
  const [economicImpact, setEconomicImpact] = useState("");
  const [criticality, setCriticality] = useState("");
  const [sort, setSort] = useState("code");
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<"list" | "grid" | "hierarchy">("list");
  const filtered = useMemo(
    () =>
      assets
        .filter((asset) => {
          const needle = search.trim().toLowerCase();
          return (
            (!needle ||
              `${asset.name} ${asset.code}`.toLowerCase().includes(needle)) &&
            (!usage || asset.usage === usage) &&
            (!economicImpact || asset.economicImpact === economicImpact) &&
            (!criticality || asset.criticality === criticality)
          );
        })
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : sort === "updated"
              ? b.updatedAt.localeCompare(a.updatedAt)
              : a.code.localeCompare(b.code, undefined, { numeric: true }),
        ),
    [assets, search, usage, economicImpact, criticality, sort],
  );
  const filterCount = [usage, economicImpact, criticality].filter(
    Boolean,
  ).length;
  function resetFilters() {
    setSearch("");
    setUsage("");
    setEconomicImpact("");
    setCriticality("");
  }
  function loadDemoHierarchy() {
    try {
      addHierarchyDemo();
      resetFilters();
      toast("Demo hierarchy added", "success");
    } catch (cause) {
      toast(
        cause instanceof Error
          ? cause.message
          : "Could not load the demo hierarchy.",
        "error",
      );
    }
  }
  if (loading || error) return <PreviewState />;
  return (
    <div className="tpm-workspace tpm-reference-list">
      <header className="tpm-page-heading">
        <div>
          <h1>
            Assets <span className="tpm-count">{assets.length}</span>
          </h1>
          <p>Select an asset to view its full details.</p>
        </div>
        <div className="tpm-actions">
          <button
            className="tpm-button tpm-export-button"
            onClick={() => exportAssets(filtered, assets)}
            disabled={!filtered.length}
          >
            <Download size={15} />
            Export CSV
          </button>
          <Link href="/tpm/assets/import" className="tpm-button">
            <Upload size={15} />
            Bulk upload
          </Link>
          <Link href="/tpm/assets/new" className="tpm-button primary">
            <Plus size={17} />
            New asset
          </Link>
        </div>
      </header>
      <AssetSummary assets={assets} />
      <section
        className="tpm-search-panel"
        aria-label="Search and filter assets"
      >
        <form
          className="tpm-reference-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(search.trim());
          }}
        >
          <div className="tpm-search">
            <Search size={17} />
            <input
              aria-label="Search assets"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search asset name or code…"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button type="submit" className="tpm-button primary">
            <Search size={15} />
            Search
          </button>
          <button
            type="button"
            className={`tpm-button ${filterCount ? "selected" : ""}`}
            aria-expanded={showFilters}
            aria-controls="asset-filters"
            onClick={() => setShowFilters(!showFilters)}
          >
            <ListFilter size={16} />
            Filters
            {filterCount > 0 && (
              <span className="tpm-count">{filterCount}</span>
            )}
          </button>
        </form>
        <p className="tpm-search-count" role="status">
          Showing <strong>{filtered.length}</strong> of{" "}
          <strong>{assets.length}</strong> assets
        </p>
        {showFilters && (
          <div className="tpm-filters" id="asset-filters">
            <label>
              Usage status
              <select
                value={usage}
                onChange={(event) => setUsage(event.target.value)}
              >
                <option value="">All usage statuses</option>
                {USAGE.map((value) => (
                  <option key={value} value={value}>
                    {assetOptionLabel("usage", value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Economic impact
              <select
                value={economicImpact}
                onChange={(event) => setEconomicImpact(event.target.value)}
              >
                <option value="">All economic impacts</option>
                {ECONOMIC_IMPACT.map((value) => (
                  <option key={value} value={value}>
                    {assetOptionLabel("economicImpact", value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Criticality
              <select
                value={criticality}
                onChange={(event) => setCriticality(event.target.value)}
              >
                <option value="">All priorities</option>
                {(["A", "B", "C"] as const).map((value) => (
                  <option key={value} value={value}>
                    {assetOptionLabel("criticality", value)}
                  </option>
                ))}
              </select>
            </label>
            <button className="tpm-text-button" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        )}
      </section>
      <section aria-label="Asset register">
        <div className="tpm-results-heading">
          <h2>
            Assets{" "}
            <span>
              ({filtered.length} of {assets.length})
            </span>
          </h2>
          <div className="tpm-list-controls">
            <label className="tpm-sort">
              <ArrowDownAZ size={15} />
              <select
                aria-label="Sort assets"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="code">Asset code</option>
                <option value="name">Name A–Z</option>
                <option value="updated">Recently updated</option>
              </select>
            </label>
            <div
              className="tpm-display-switch"
              role="group"
              aria-label="Asset display"
            >
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <List size={15} />
                List
              </button>
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={15} />
                Grid
              </button>
              <button
                type="button"
                aria-label="Hierarchy view"
                aria-pressed={view === "hierarchy"}
                onClick={() => setView("hierarchy")}
              >
                <Network size={15} />
                Hierarchy
              </button>
            </div>
          </div>
        </div>
        {!filtered.length ? (
          <div className="tpm-empty">
            <Search size={32} />
            <h2>No assets match your search</h2>
            <p>Try another name or remove a filter to see more equipment.</p>
            <button className="tpm-button" onClick={resetFilters}>
              Clear search & filters
            </button>
          </div>
        ) : view === "hierarchy" ? (
          <AssetHierarchy
            key={JSON.stringify([search, usage, economicImpact, criticality])}
            assets={assets}
            matches={filtered}
            sort={sort}
            hasFilters={Boolean(search.trim() || filterCount)}
            demoLoaded={hasHierarchyDemoAssets(assets)}
            onLoadDemo={loadDemoHierarchy}
          />
        ) : (
          <ul
            className={`tpm-reference-rows ${view === "grid" ? "is-grid" : ""}`}
            aria-label="Assets"
          >
            {filtered.map((asset) => (
              <li key={asset.id}>
                <Link
                  href={`/tpm/assets/${asset.id}`}
                  className="tpm-reference-row"
                >
                  <div className="tpm-row-identity">
                    <span className="tpm-equipment-icon">
                      <Factory size={19} strokeWidth={1.6} />
                    </span>
                    <div>
                      <strong>{asset.name}</strong>
                      <span className="tpm-asset-code">{asset.code}</span>
                    </div>
                  </div>
                  <dl className="tpm-row-facts">
                    <div>
                      <dt>Usage status</dt>
                      <dd>
                        <span
                          className={`tpm-pill ${asset.usage === "Active" ? "green" : asset.usage === "Intermittent" ? "amber" : "gray"}`}
                        >
                          <span className="tpm-status-dot" />
                          {asset.usage}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Economic impact</dt>
                      <dd>{asset.economicImpact}</dd>
                    </div>
                    <div>
                      <dt>Criticality</dt>
                      <dd>
                        <CriticalityPill value={asset.criticality} />
                      </dd>
                    </div>
                  </dl>
                  <ChevronRight
                    size={16}
                    className="tpm-open-chevron"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="tpm-list-footer">
          Sample assets · Changes saved on this device
        </p>
      </section>
    </div>
  );
}
