"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Factory,
  FileText,
  MapPin,
  Pencil,
  Settings2,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useAssets } from "./AssetsProvider";
import type { Asset } from "./asset-preview";
import "./asset-structure-details.css";

export function AssetSymbol({
  asset,
  large = false,
}: {
  asset: Asset;
  large?: boolean;
}) {
  const Icon =
    asset.category === "Key utility equipment"
      ? Settings2
      : asset.category === "Auxiliary equipment"
        ? Boxes
        : Factory;
  return (
    <div
      className={`tpm-asset-symbol ${large ? "is-large" : ""} ${asset.usage === "Retired" ? "is-muted" : ""}`}
    >
      {asset.photo ? (
        <Image
          src={asset.photo}
          alt={asset.name}
          width={large ? 320 : 52}
          height={large ? 180 : 52}
          unoptimized
        />
      ) : (
        <Icon size={large ? 58 : 23} strokeWidth={large ? 1 : 1.5} />
      )}
    </div>
  );
}

export function StatusPill({ asset }: { asset: Asset }) {
  const status = asset.stage === "Draft" ? "Draft" : asset.operating;
  const tone =
    status === "Operational"
      ? "green"
      : status === "Under maintenance"
        ? "amber"
        : status === "Breakdown"
          ? "red"
          : "gray";
  return (
    <span className={`tpm-pill ${tone}`}>
      <span className="tpm-status-dot" />
      {status}
    </span>
  );
}

export function CriticalityPill({ value }: { value: Asset["criticality"] }) {
  return (
    <span className={`tpm-criticality ${value.toLowerCase()}`}>
      {value}
      <span>{value === "A" ? "High" : value === "B" ? "Medium" : "Low"}</span>
    </span>
  );
}

export function PreviewState() {
  const { error, retry, reset } = useAssets();
  const [resetError, setResetError] = useState("");
  if (!error)
    return (
      <div className="tpm-loading" role="status">
        <span className="tpm-spinner" />
        Loading assets…
      </div>
    );
  return (
    <div className="tpm-empty" role="alert">
      <Boxes size={30} />
      <h2>We couldn’t open your preview</h2>
      <p>{resetError || error}</p>
      <div className="tpm-actions">
        <button className="tpm-button" onClick={retry}>
          Try again
        </button>
        <button
          className="tpm-button"
          onClick={() => {
            if (
              window.confirm(
                "Replace this browser’s saved preview assets with the original sample assets? Your preview changes will be lost.",
              )
            ) {
              try {
                reset();
                retry();
              } catch (cause) {
                setResetError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not reset preview.",
                );
              }
            }
          }}
        >
          Reset sample assets
        </button>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="tpm-info">
      <dt>{label}</dt>
      <dd>
        {children || <span className="tpm-unassigned">Not specified</span>}
      </dd>
    </div>
  );
}

function InfoSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="tpm-info-section">
      <h3>
        {icon}
        {title}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

export function AssetDetails({
  asset,
  onBack,
  fullPage = false,
}: {
  asset: Asset;
  onBack?: () => void;
  fullPage?: boolean;
}) {
  const { assets } = useAssets();
  const [tab, setTab] = useState("Overview");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const byId = new Map(assets.map((item) => [item.id, item]));
  const parent = byId.get(asset.parentId);
  const ancestors: Asset[] = [];
  const visited = new Set([asset.id]);
  let ancestor = parent;
  while (ancestor && !visited.has(ancestor.id)) {
    visited.add(ancestor.id);
    ancestors.unshift(ancestor);
    ancestor = byId.get(ancestor.parentId);
  }
  const children = assets
    .filter((item) => item.parentId === asset.id && item.id !== asset.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const tabs = ["Overview", "Technical details", "History"];
  return (
    <article
      className={`tpm-details ${fullPage ? "tpm-full-details" : ""}`}
      aria-label={`${asset.name} details`}
    >
      <div className="tpm-detail-heading">
        {onBack && (
          <button className="tpm-mobile-back" onClick={onBack}>
            <ArrowLeft size={16} /> All assets
          </button>
        )}
        <div className="tpm-detail-title-row">
          <div>
            <div className="tpm-eyebrow">
              {asset.code}
              <span>·</span>
              {asset.stage}
            </div>
            <h2>{asset.name}</h2>
            <p>
              <MapPin size={13} />
              {[asset.site, asset.location].filter(Boolean).join(" / ") ||
                "Location not added"}
            </p>
          </div>
          <div className="tpm-actions">
            <button
              className="tpm-icon-button"
              aria-label="Copy asset link"
              title="Copy asset link"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/tpm/assets/${asset.id}`,
                  );
                  setCopied(true);
                  setCopyError("");
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  setCopyError(
                    "Could not copy the link. Open the asset and copy its address.",
                  );
                }
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
            <Link href={`/tpm/assets/${asset.id}/edit`} className="tpm-button">
              <Pencil size={14} />
              Edit
            </Link>
          </div>
        </div>
        {copyError && (
          <p className="tpm-field-error" role="alert">
            {copyError}
          </p>
        )}
        <div className="tpm-detail-status">
          <StatusPill asset={asset} />
          <CriticalityPill value={asset.criticality} />
        </div>
        <nav className="tpm-asset-structure" aria-label="Asset hierarchy">
          <span className="tpm-overline">Asset hierarchy</span>
          <ol>
            <li>
              <Link href="/tpm/assets">All assets</Link>
            </li>
            {ancestors.map((item) => (
              <li key={item.id}>
                <ChevronRight size={13} aria-hidden="true" />
                <Link
                  href={`/tpm/assets/${item.id}`}
                  title={`${item.level ?? "Equipment"} · ${item.code}`}
                >
                  {item.name}
                  <small>{item.level ?? "Equipment"}</small>
                </Link>
              </li>
            ))}
            <li>
              <ChevronRight size={13} aria-hidden="true" />
              <span aria-current="page">
                {asset.name}
                <small>{asset.level ?? "Equipment"}</small>
              </span>
            </li>
          </ol>
        </nav>
      </div>
      <div className="tpm-tabs" role="tablist" aria-label="Asset information">
        {tabs.map((name, index) => (
          <button
            key={name}
            id={`asset-tab-${index}`}
            role="tab"
            aria-selected={tab === name}
            aria-controls={`asset-panel-${index}`}
            tabIndex={tab === name ? 0 : -1}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (next !== -1) {
                event.preventDefault();
                setTab(tabs[next]);
                document.getElementById(`asset-tab-${next}`)?.focus();
              }
            }}
          >
            {name}
            {name === "History" && <span>{asset.history.length}</span>}
          </button>
        ))}
      </div>
      <div
        className="tpm-detail-body"
        role="tabpanel"
        id={`asset-panel-${tabs.indexOf(tab)}`}
        aria-labelledby={`asset-tab-${tabs.indexOf(tab)}`}
      >
        {tab === "Overview" && (
          <>
            <div className="tpm-asset-intro">
              <AssetSymbol asset={asset} large />
              <div>
                <span className="tpm-overline">Equipment profile</span>
                <h3>
                  {asset.purpose ||
                    asset.category ||
                    "Add equipment information"}
                </h3>
                <p>
                  {asset.description ||
                    "Add a description to help your team identify this equipment and understand its purpose."}
                </p>
                <span className="tpm-category-label">
                  {asset.category || "Uncategorized"}
                </span>
              </div>
            </div>
            <div className="tpm-info-grid">
              <InfoSection
                title="Location & identity"
                icon={<MapPin size={16} />}
              >
                <Info label="Asset code">{asset.code}</Info>
                <Info label="Asset level">{asset.level ?? "Equipment"}</Info>
                <Info label="Plant / site">{asset.site}</Info>
                <Info label="Department">{asset.department}</Info>
                <Info label="Workplace / Gemba">{asset.location}</Info>
                <Info label="Parent asset">
                  {parent ? (
                    <Link href={`/tpm/assets/${parent.id}`}>
                      {parent.name}
                      <ArrowUpRight size={12} />
                    </Link>
                  ) : asset.parentId ? (
                    "Parent unavailable"
                  ) : (
                    "Top-level asset"
                  )}
                </Info>
              </InfoSection>
              <InfoSection
                title="Condition & importance"
                icon={<ShieldCheck size={16} />}
              >
                <Info label="Equipment health">
                  <span
                    className={`tpm-health ${["Poor", "Very Poor"].includes(asset.health) ? "poor" : ""}`}
                  >
                    {asset.health}
                  </span>
                </Info>
                <Info label="Usage status">{asset.usage}</Info>
                <Info label="Criticality">
                  <CriticalityPill value={asset.criticality} />
                </Info>
                <Info label="Economic impact">{asset.economicImpact}</Info>
                <Info label="Operating status">{asset.operating}</Info>
              </InfoSection>
            </div>
            <InfoSection title="People responsible" icon={<Users size={16} />}>
              <Info label="Primary operator">{asset.operator}</Info>
              <Info label="Backup operator">{asset.backupOperator}</Info>
              <Info label="Maintenance owner">{asset.maintenanceOwner}</Info>
              <Info label="Maintenance team">{asset.team}</Info>
            </InfoSection>
            {children.length > 0 && (
              <section className="tpm-info-section">
                <h3>
                  <Boxes size={16} />
                  Child assets{" "}
                  <span className="tpm-count">{children.length}</span>
                </h3>
                {children.map((child) => (
                  <Link
                    className="tpm-child-asset"
                    href={`/tpm/assets/${child.id}`}
                    key={child.id}
                  >
                    <AssetSymbol asset={child} />
                    <span>
                      {child.name}
                      <small>
                        {child.level ?? "Equipment"} · {child.code}
                      </small>
                    </span>
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
              </section>
            )}
            <div className="tpm-next-step">
              <span>
                <Wrench size={19} />
              </span>
              <div>
                <strong>A home for your maintenance history</strong>
                <p>
                  PM plans and work orders will connect to this asset in the
                  next step. Use Inspection reports to record AM and PM checks.
                </p>
              </div>
            </div>
          </>
        )}
        {tab === "Technical details" && (
          <>
            <InfoSection
              title="Manufacturer & specifications"
              icon={<Settings2 size={16} />}
            >
              <Info label="Manufacturer">{asset.manufacturer}</Info>
              <Info label="Model">{asset.model}</Info>
              <Info label="Serial number">{asset.serialNumber}</Info>
              <Info label="Capacity / rating">{asset.capacity}</Info>
              <Info label="Installation date">{asset.installedOn}</Info>
              <Info label="Warranty expires">{asset.warrantyUntil}</Info>
            </InfoSection>
            <section className="tpm-info-section">
              <h3>
                <FileText size={16} />
                Notes & instructions
              </h3>
              <p className="tpm-preserve-text">
                {asset.notes ||
                  "No reference notes added. Edit this asset to record useful operating or maintenance information."}
              </p>
            </section>
          </>
        )}
        {tab === "History" && (
          <div className="tpm-history">
            <p className="tpm-history-caption">
              Changes made to this asset in your preview.
            </p>
            {asset.history.map((event) => (
              <div key={event.id} className="tpm-history-event">
                <span>
                  <Clock3 size={15} />
                </span>
                <div>
                  <strong>{event.message}</strong>
                  <time dateTime={event.at}>
                    {new Date(event.at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function AssetPage({ id }: { id: string }) {
  const { assets, loading, error } = useAssets();
  if (loading || error) return <PreviewState />;
  const asset = assets.find((item) => item.id === id);
  return (
    <div className="tpm-single-page">
      <Link className="tpm-back-link" href="/tpm/assets">
        <ArrowLeft size={15} /> All assets
      </Link>
      {asset ? (
        <AssetDetails asset={asset} fullPage />
      ) : (
        <div className="tpm-empty">
          <Boxes size={32} />
          <h1>Asset not found in this preview</h1>
          <p>Preview assets belong to this browser and workspace.</p>
          <Link href="/tpm/assets" className="tpm-button">
            Back to assets
          </Link>
        </div>
      )}
    </div>
  );
}
