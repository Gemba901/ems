"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Archive,
  Boxes,
  CheckCircle2,
  Factory,
  FilePenLine,
  HeartPulse,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  TriangleAlert,
  Wrench,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import type { Asset } from "./asset-preview";

type Metric = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  matches: (asset: Asset) => boolean;
};

const DEFAULT_CARDS = ["total", "operational", "attention", "critical"];
const METRICS: Metric[] = [
  {
    id: "total",
    label: "Total Assets",
    description: "Your equipment register",
    icon: Boxes,
    tone: "blue",
    matches: () => true,
  },
  {
    id: "operational",
    label: "Operational",
    description: "Available for operation",
    icon: CheckCircle2,
    tone: "green",
    matches: (a) => a.stage === "Registered" && a.operating === "Operational",
  },
  {
    id: "attention",
    label: "Needs attention",
    description: "Maintenance or poor health",
    icon: Wrench,
    tone: "amber",
    matches: (a) =>
      a.stage === "Registered" &&
      (["Under maintenance", "Breakdown"].includes(a.operating) ||
        ["Poor", "Very Poor"].includes(a.health)),
  },
  {
    id: "critical",
    label: "High criticality",
    description: "Priority A equipment",
    icon: ShieldAlert,
    tone: "red",
    matches: (a) =>
      a.stage === "Registered" &&
      a.criticality === "A" &&
      a.usage !== "Retired",
  },
  {
    id: "active",
    label: "Active assets",
    description: "Registered, active usage",
    icon: Activity,
    tone: "green",
    matches: (a) => a.stage === "Registered" && a.usage === "Active",
  },
  {
    id: "maintenance",
    label: "Under maintenance",
    description: "Maintenance in progress",
    icon: Settings2,
    tone: "amber",
    matches: (a) =>
      a.stage === "Registered" && a.operating === "Under maintenance",
  },
  {
    id: "breakdown",
    label: "Breakdowns",
    description: "Equipment in breakdown",
    icon: TriangleAlert,
    tone: "red",
    matches: (a) => a.stage === "Registered" && a.operating === "Breakdown",
  },
  {
    id: "retired",
    label: "Retired assets",
    description: "Retired equipment",
    icon: Archive,
    tone: "gray",
    matches: (a) => a.stage === "Registered" && a.usage === "Retired",
  },
  {
    id: "production",
    label: "Production equipment",
    description: "Production, excluding retired",
    icon: Factory,
    tone: "purple",
    matches: (a) =>
      a.stage === "Registered" &&
      a.category === "Production equipment" &&
      a.usage !== "Retired",
  },
  {
    id: "drafts",
    label: "Draft assets",
    description: "Awaiting registration",
    icon: FilePenLine,
    tone: "gray",
    matches: (a) => a.stage === "Draft",
  },
  {
    id: "impact",
    label: "High economic impact",
    description: "High impact, excluding retired",
    icon: TrendingUp,
    tone: "purple",
    matches: (a) =>
      a.stage === "Registered" &&
      a.economicImpact === "High" &&
      a.usage !== "Retired",
  },
  {
    id: "health",
    label: "Poor health",
    description: "Poor or very poor condition",
    icon: HeartPulse,
    tone: "red",
    matches: (a) =>
      a.stage === "Registered" && ["Poor", "Very Poor"].includes(a.health),
  },
];

function readSelection(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_CARDS;
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved) || !saved.every((id) => typeof id === "string"))
      return DEFAULT_CARDS;
    const valid = [
      ...new Set(
        saved.filter((id) => METRICS.some((metric) => metric.id === id)),
      ),
    ];
    return saved.length && !valid.length ? DEFAULT_CARDS : valid;
  } catch {
    return DEFAULT_CARDS;
  }
}

export function AssetSummary({ assets }: { assets: Asset[] }) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [storageNote, setStorageNote] = useState("");
  const storageKey = `gemba:tpm-summary-cards:v1:${user?.organizationId ?? "none"}:${user?.userId ?? "none"}`;
  const queryKey = ["tpm-summary-preferences", storageKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => readSelection(storageKey),
    enabled: !!user,
    staleTime: Infinity,
  });
  const visibleCards = query.data ?? DEFAULT_CARDS;
  const metrics = METRICS.map((metric) => ({
    ...metric,
    value: assets.filter(metric.matches).length,
  }));
  const options = metrics.filter((metric) =>
    `${metric.label} ${metric.description}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  function chooseCards(ids: string[]) {
    if (!user || query.isPending) return;
    client.setQueryData(queryKey, ids);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
      setStorageNote("");
    } catch {
      setStorageNote(
        "Selection updated for this visit. Your browser could not save it for next time.",
      );
    }
  }

  return (
    <section className="tpm-summary" aria-label="Asset summary">
      <div className="tpm-summary-tools">
        <details
          className="tpm-summary-options"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary>
            <SlidersHorizontal size={14} />
            Summary cards ({visibleCards.length} of {metrics.length})
          </summary>
          <div className="tpm-summary-menu">
            <div className="tpm-summary-menu-heading">
              <strong>Choose your KPIs</strong>
              <p>Remembered for you in this browser.</p>
            </div>
            <div className="tpm-summary-search">
              <Search size={14} />
              <input
                aria-label="Search KPIs"
                placeholder="Find a KPI…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="tpm-summary-choices">
              {options.map((metric) => (
                <label key={metric.id}>
                  <input
                    type="checkbox"
                    aria-label={metric.label}
                    disabled={query.isPending}
                    checked={visibleCards.includes(metric.id)}
                    onChange={(event) =>
                      chooseCards(
                        event.target.checked
                          ? [...visibleCards, metric.id]
                          : visibleCards.filter((id) => id !== metric.id),
                      )
                    }
                  />
                  <span className="tpm-summary-option-copy">
                    <strong>{metric.label}</strong>
                    <small>{metric.description}</small>
                  </span>
                  <span className="tpm-summary-option-count">
                    {metric.value}
                  </span>
                </label>
              ))}
              {!options.length && (
                <p className="tpm-summary-empty">No matching KPIs.</p>
              )}
            </div>
            <div className="tpm-summary-menu-actions">
              <button
                type="button"
                className="tpm-text-button"
                disabled={query.isPending}
                onClick={() => chooseCards(METRICS.map((metric) => metric.id))}
              >
                Show all
              </button>
              <button
                type="button"
                className="tpm-text-button"
                disabled={query.isPending}
                onClick={() => chooseCards([])}
              >
                Hide all
              </button>
              <button
                type="button"
                className="tpm-text-button"
                disabled={query.isPending}
                onClick={() => chooseCards(DEFAULT_CARDS)}
              >
                Reset defaults
              </button>
            </div>
          </div>
        </details>
      </div>
      {storageNote && (
        <p className="tpm-summary-storage-note" role="status">
          {storageNote}
        </p>
      )}
      {visibleCards.length ? (
        <div className="tpm-summary-grid">
          {metrics
            .filter((metric) => visibleCards.includes(metric.id))
            .map((metric) => (
              <article
                className="tpm-summary-card"
                data-kpi={metric.label}
                key={metric.id}
                title={metric.description}
                aria-label={`${metric.label}: ${metric.value}. ${metric.description}`}
              >
                <span className={`tpm-summary-icon ${metric.tone}`}>
                  <metric.icon size={17} strokeWidth={1.8} />
                </span>
                <div>
                  <strong>{metric.value}</strong>
                  <span>{metric.label}</span>
                </div>
                <small className="tpm-summary-detail">
                  {metric.description}
                </small>
              </article>
            ))}
        </div>
      ) : (
        <p className="tpm-summary-empty">
          All KPI cards are hidden. Choose cards from Summary cards.
        </p>
      )}
    </section>
  );
}
