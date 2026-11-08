"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getOrganogram } from "@/services/leadership-excellence/organisation-framework.service";
import {
  TYPE_LABEL,
  defaultOpen,
  indexUnits,
  initialScope,
  initials,
  photoUrl,
  searchUnits,
  visibleUnits,
  within,
} from "./organogram";
import {
  SIZES,
  type ChartDensity,
  fitPresentation,
  layoutChart,
} from "./organogram-layout";
import type {
  OrganogramViewData,
  OrganisationUnit,
  StructurePerson,
} from "./types";
import styles from "./organogram.module.css";

export function OrganogramView() {
  const { accessToken, user } = useAuthStore();
  const query = useQuery({
    queryKey: ["lex-organogram", user?.organizationId, user?.userId],
    queryFn: ({ signal }) => getOrganogram(accessToken!, signal),
    enabled: !!accessToken && !!user?.organizationId,
  });
  return (
    <main className={styles.workspace}>
      <header className={styles.heading}>
        <p>02.01 · ORGANISATION FRAMEWORK</p>
        <h1>Your organisation, connected.</h1>
        <p>
          Explore branches, departments and sections. Select a card for its
          people and details.
        </p>
      </header>
      {!query.data ? (
        <div role={query.error ? "alert" : "status"} className={styles.message}>
          {query.error ? (
            <>
              <p>{(query.error as Error).message}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Retry connection
              </Button>
            </>
          ) : (
            "Loading organisation…"
          )}
        </div>
      ) : (
        <Organogram
          key={`${user?.organizationId}:${user?.userId}`}
          structure={query.data}
          preferenceKey={`lex-organogram:${user?.organizationId}:${user?.userId}`}
          refreshing={query.isFetching}
          refreshError={query.error ? (query.error as Error).message : null}
          onRefresh={() => void query.refetch()}
        />
      )}
    </main>
  );
}

/** Exported separately for interaction tests using the actual components. */
export function Organogram({
  structure,
  preferenceKey,
  refreshing = false,
  refreshError = null,
  onRefresh,
}: {
  structure: OrganogramViewData;
  preferenceKey: string;
  refreshing?: boolean;
  refreshError?: string | null;
  onRefresh: () => void;
}) {
  const index = useMemo(() => indexUnits(structure), [structure]);
  const [scope, setScope] = useState(() => initialScope(structure, null));
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [open, setOpen] = useState(() =>
    defaultOpen(structure, initialScope(structure, null)),
  );
  const [term, setTerm] = useState(""),
    [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1),
    [width, setWidth] = useState(1000),
    [height, setHeight] = useState(540),
    [density, setDensity] = useState<ChartDensity>("cards"),
    [layoutWidth, setLayoutWidth] = useState<number | null>(null),
    [fitTick, setFitTick] = useState(0),
    [mobile, setMobile] = useState(false);
  const viewport = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const anchor = useRef<{
    id: string;
    x: number;
    y: number;
    reveal?: boolean;
  } | null>(null);
  const pan = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const fitPending = useRef(true),
    autoFit = useRef(true),
    preference = useRef(preferenceKey);
  type SavedView = {
    scope: string;
    open: Set<string>;
    term: string;
    zoom: number;
    density: ChartDensity;
    layoutWidth: number | null;
    left: number;
    top: number;
  };
  const [history, setHistory] = useState<SavedView[]>([]);
  const [reloadRequested, setReloadRequested] = useState(false);
  const requestFit = () => {
    fitPending.current = true;
    autoFit.current = true;
    setFitTick((n) => n + 1);
  };
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(preferenceKey);
    } catch {
      /* Storage can be disabled. */
    }
    const initial = initialScope(structure, saved);
    fitPending.current = true;
    setScope(initial);
    setOpen(defaultOpen(structure, initial));
    setPreferenceReady(true);
    // Read once for this signed-in viewer; a source refresh must not reset their expansion or selection.
  }, [preferenceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (preferenceReady && preference.current === preferenceKey)
      try {
        localStorage.setItem(preferenceKey, scope);
      } catch {
        /* A view preference is optional. */
      }
  }, [preferenceReady, preferenceKey, scope]);
  useEffect(() => {
    if (scope && !index.byId.has(scope)) {
      const next = initialScope(structure, null);
      setScope(next);
      setOpen(defaultOpen(structure, next));
    }
    if (selected && !index.byId.has(selected)) setSelected(null);
  }, [index, scope, selected, structure]);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth || 1000,
        h = el.clientHeight || 540;
      setWidth(w);
      setHeight(h);
      if (autoFit.current) {
        fitPending.current = true;
        setFitTick((n) => n + 1);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1099px)"),
      update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (mobile && selected && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [mobile, selected]);

  const found = useMemo(
    () => searchUnits(index, structure.units, term),
    [index, structure.units, term],
  );
  const scopedIds = useMemo(
    () =>
      scope ? within(index, scope) : new Set(structure.units.map((u) => u.id)),
    [index, scope, structure.units],
  );
  const effectiveOpen = useMemo(
    () => (found ? new Set([...open, ...found.keep]) : open),
    [found, open],
  );
  const visible = useMemo(
    () => visibleUnits(index, scope, effectiveOpen, found?.keep),
    [index, scope, effectiveOpen, found],
  );
  const tree = useMemo(
    () => layoutChart(visible, layoutWidth ?? width, density),
    [visible, width, layoutWidth, density],
  );
  const centre = Math.max(0, (width / zoom - tree.width) / 2);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    if (fitPending.current) {
      fitPending.current = false;
      const next = fitPresentation(
        visible,
        el.clientWidth || width,
        el.clientHeight || height,
      );
      setDensity(next.density);
      setLayoutWidth(next.layoutWidth);
      setZoom(next.zoom);
      el.scrollTo({ left: 0, top: 0 });
    } else if (anchor.current) {
      const a = anchor.current,
        p = tree.positions.get(a.id);
      anchor.current = null;
      if (p) {
        let left = Math.max(0, (p.x + centre) * zoom - a.x);
        const bounds = tree.bounds.get(a.id);
        if (a.reveal && bounds && bounds.width * zoom <= el.clientWidth - 24) {
          const edge = (bounds.left + centre) * zoom - left;
          if (edge < 12 || edge + bounds.width * zoom > el.clientWidth - 12)
            left = Math.max(
              0,
              (bounds.left + centre) * zoom -
                (el.clientWidth - bounds.width * zoom) / 2,
            );
        }
        let top = Math.max(0, p.y * zoom - a.y);
        if (
          a.reveal &&
          bounds &&
          bounds.height * zoom <= el.clientHeight - 24
        ) {
          const edge = bounds.top * zoom - top;
          if (edge < 12 || edge + bounds.height * zoom > el.clientHeight - 12)
            top = Math.max(0, bounds.top * zoom - 12);
        }
        el.scrollTo({ left, top });
      }
    }
  }, [tree, zoom, centre, fitTick, visible, width, height]);
  const toggle = (id: string) => {
    autoFit.current = false;
    setLayoutWidth(null);
    const el = viewport.current,
      p = tree.positions.get(id);
    if (el && p)
      anchor.current = {
        id,
        reveal: !open.has(id),
        x: (p.x + centre) * zoom - el.scrollLeft,
        y: p.y * zoom - el.scrollTop,
      };
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const focus = (id: string) => {
    if (id !== scope)
      setHistory((current) => [
        ...current,
        {
          scope,
          open: new Set(open),
          term,
          zoom,
          density,
          layoutWidth,
          left: viewport.current?.scrollLeft ?? 0,
          top: viewport.current?.scrollTop ?? 0,
        },
      ]);
    // A leaf has no subtree to explore: show it in its parent's context instead.
    const leaf = id && !index.childrenOf(id).length;
    const next = leaf ? index.byId.get(id)?.parentId || "" : id;
    setScope(next);
    setOpen(defaultOpen(structure, next));
    setTerm("");
    setSelected(leaf ? id : null);
    requestFit();
  };
  const back = () => {
    const previous = history.at(-1);
    if (!previous) return;
    autoFit.current = false;
    fitPending.current = false;
    setHistory((h) => h.slice(0, -1));
    setScope(previous.scope);
    setOpen(previous.open);
    setTerm(previous.term);
    setZoom(previous.zoom);
    setDensity(previous.density);
    setLayoutWidth(previous.layoutWidth);
    setSelected(null);
    requestAnimationFrame(() =>
      viewport.current?.scrollTo({ left: previous.left, top: previous.top }),
    );
  };
  const fit = () => requestFit();
  const fullCards = () => {
    autoFit.current = false;
    fitPending.current = false;
    setDensity("cards");
    setLayoutWidth(null);
    setZoom(1);
    viewport.current?.scrollTo({ left: 0, top: 0 });
  };
  const zoomTo = (value: number) => {
    autoFit.current = false;
    fitPending.current = false;
    const next = Math.min(1.5, Math.max(0.5, value)),
      el = viewport.current;
    if (el) {
      const p =
        tree.positions.get(scope || "company") ??
        tree.positions.values().next().value;
      if (p)
        anchor.current = {
          id: p.id,
          x: (p.x + centre) * zoom - el.scrollLeft,
          y: p.y * zoom - el.scrollTop,
        };
    }
    setZoom(next);
  };
  const selectedUnit = selected ? index.byId.get(selected) : null;
  const closeDetails = () => {
    setSelected(null);
    requestAnimationFrame(() =>
      document.getElementById(`unit-${selected}`)?.focus(),
    );
  };
  const details = selectedUnit && (
    <UnitDetails
      key={selectedUnit.id}
      unit={selectedUnit}
      structure={structure}
      currentScope={scope}
      onFocus={focus}
      onClose={closeDetails}
    />
  );
  const departmentCount = new Set(
    structure.units.map((u) => u.departmentId).filter(Boolean),
  ).size;
  const branches = structure.units.filter(
    (u) => u.type === "BRANCH" && u.branch,
  );
  const hits = found
    ? [...found.hits].filter((id) => scopedIds.has(id)).length
    : 0;

  return (
    <>
      <div className={styles.summary}>
        <span>
          <strong>{branches.length}</strong> recorded branches / sites
        </span>
        <span>
          <strong>{departmentCount}</strong> departments
        </span>
        <span>
          <strong>{structure.people.active.toLocaleString()}</strong> active
          people{" "}
          <small>(includes {structure.people.probation} probation)</small>
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          title="Reload branches, departments and people from the source. Your current view stays open."
          onClick={() => {
            setReloadRequested(true);
            onRefresh();
          }}
        >
          <RefreshCw className={refreshing ? "animate-spin" : ""} />{" "}
          {refreshing ? "Reloading…" : "Reload data"}
        </Button>
      </div>
      <p className={styles.reloadStatus} role="status">
        {reloadRequested && !refreshing && !refreshError
          ? "Data reloaded · "
          : ""}
        {Number.isNaN(Date.parse(structure.source.loadedAt))
          ? ""
          : `Loaded ${new Date(structure.source.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · `}
        Reload data checks for changes to branches, departments and people.
      </p>
      {refreshError && (
        <p role="alert" className={styles.warning}>
          Refresh failed: {refreshError}. Showing the last loaded structure.
        </p>
      )}
      <section className={styles.chart} aria-label="Organisation organogram">
        <div className={styles.toolbar}>
          <div className={styles.scopeButtons}>
            <Button
              variant={scope === "" ? "default" : "outline"}
              onClick={() => focus("")}
            >
              Whole company
            </Button>
            {structure.viewer.branchIds.length === 1 && (
              <Button
                variant={
                  scope === structure.viewer.branchIds[0]
                    ? "default"
                    : "outline"
                }
                onClick={() => focus(structure.viewer.branchIds[0])}
              >
                My branch
              </Button>
            )}
            <label className={styles.selectLabel}>
              {structure.viewer.branchIds.length > 1
                ? "Choose a branch · your branches marked ★"
                : "Focus on a branch"}
              <select
                aria-label="Focus on a branch"
                value={scope}
                onChange={(e) => focus(e.target.value)}
              >
                <option value="">Whole company</option>
                {scope &&
                  !branches.some((u) => u.id === scope) &&
                  index.byId.has(scope) && (
                    <option value={scope}>
                      Focused: {index.byId.get(scope)!.name}
                    </option>
                  )}
                {branches.map((u) => (
                  <option key={u.id} value={u.id}>
                    {structure.viewer.branchIds.includes(u.id) ? "★ " : ""}
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={styles.search}>
            Find a unit
            <Input
              aria-label="Find a unit"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                requestFit();
              }}
              placeholder="Branch, department, section or lead"
            />
          </label>
        </div>
        {structure.viewer.status === "UNASSIGNED" && !scope && (
          <p className={styles.hint}>
            No branch is linked to your employee record. Showing the company
            view; you can choose a branch above.
          </p>
        )}
        {structure.viewer.status === "MULTIPLE" && !scope && (
          <p className={styles.hint}>
            You have more than one branch assignment. Choose the branch you want
            to explore.
          </p>
        )}
        <div className={styles.tools}>
          <nav aria-label="Unit breadcrumb">
            {history.length > 0 && (
              <button onClick={back}>← Back to previous view</button>
            )}
            <button onClick={() => focus("")}>{structure.company.name}</button>
            {scope &&
              index
                .pathTo(scope)
                .filter((u) => u.type !== "COMPANY")
                .map((u) => (
                  <span key={u.id}>
                    <ChevronRight size={14} />
                    <button onClick={() => focus(u.id)}>{u.name}</button>
                  </span>
                ))}
          </nav>
          <div className={styles.toolButtons}>
            <Button
              variant="outline"
              size="sm"
              title="Close departments and sections; keep the company and branches visible"
              onClick={() => {
                setTerm("");
                setOpen(defaultOpen(structure, scope));
                setSelected(null);
                requestFit();
              }}
            >
              Close all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(new Set(structure.units.map((u) => u.id)));
                requestFit();
              }}
            >
              Open all
            </Button>
            {density !== "cards" && (
              <Button variant="outline" size="sm" onClick={fullCards}>
                Full cards
              </Button>
            )}
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Zoom out"
              onClick={() => zoomTo(zoom / 1.2)}
            >
              <Minus />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Reset zoom to 100%"
              onClick={fullCards}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Zoom in"
              onClick={() => zoomTo(zoom * 1.2)}
            >
              <Plus />
            </Button>
            <Button variant="outline" size="sm" onClick={fit}>
              <Maximize2 />
              Fit
            </Button>
          </div>
        </div>
        {found && (
          <p role="status" className={styles.hint}>
            {hits
              ? `${hits} matching units in this view`
              : "No matching units in this view. Clear the search or choose Whole company."}
          </p>
        )}
        <p className={styles.hint}>
          {scope
            ? `Units within ${index.byId.get(scope)?.name}.`
            : "Branches sit under the company; departments stay connected to their branch."}{" "}
          Open a branch to spread its departments across the canvas. Drag the
          background to pan.
        </p>
        {density !== "cards" && (
          <div className={styles.legend} role="status">
            <strong>
              {density === "map" ? "Whole-structure map" : "Compact overview"}
            </strong>
            <span>
              {visible.length} units ·{" "}
              {density === "map"
                ? "Each tile is one unit. Hover for its name; select for details."
                : "Names and counts stay visible. Select a unit for its lead and people."}
            </span>
            {(["COMPANY", "BRANCH", "DEPARTMENT", "SECTION"] as const).map(
              (kind) => (
                <span key={kind} className={styles.legendItem}>
                  <i data-kind={kind} />
                  {TYPE_LABEL[kind]}
                </span>
              ),
            )}
          </div>
        )}
        <div className={styles.chartAndDetails}>
          <div
            ref={viewport}
            className={styles.viewport}
            tabIndex={0}
            aria-label="Organogram chart; scroll to explore"
            onPointerDown={(e) => {
              if (
                e.pointerType === "mouse" &&
                e.button === 0 &&
                !(e.target as HTMLElement).closest("button,input,select,a")
              ) {
                pan.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: e.currentTarget.scrollLeft,
                  top: e.currentTarget.scrollTop,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
                e.preventDefault();
              }
            }}
            onPointerMove={(e) => {
              if (pan.current)
                e.currentTarget.scrollTo({
                  left: pan.current.left - (e.clientX - pan.current.x),
                  top: pan.current.top - (e.clientY - pan.current.y),
                });
            }}
            onPointerUp={(e) => {
              pan.current = null;
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              pan.current = null;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeDetails();
            }}
          >
            <div
              className={styles.scaledBounds}
              style={{
                width: Math.max(width, tree.width * zoom),
                height: Math.max(height, tree.height * zoom),
              }}
            >
              <div
                className={styles.drawing}
                style={{
                  width: tree.width,
                  height: tree.height,
                  transform: `translateX(${centre * zoom}px) scale(${zoom})`,
                }}
              >
                <svg
                  aria-hidden="true"
                  className={styles.connectors}
                  width={tree.width}
                  height={tree.height}
                >
                  {tree.edges.map((e) => (
                    <path
                      key={e.child}
                      d={e.path}
                      data-parent={e.parent}
                      data-child={e.child}
                    />
                  ))}
                </svg>
                {visible.map((u) => {
                  const at = tree.positions.get(u.id)!;
                  return (
                    <UnitCard
                      key={u.id}
                      unit={u}
                      density={density}
                      x={at.x}
                      y={at.y}
                      childrenCount={index.childrenOf(u.id).length}
                      open={effectiveOpen.has(u.id)}
                      selected={u.id === selected}
                      hit={!!found?.hits.has(u.id)}
                      flagged={index.checksFor(u.id).length > 0}
                      onToggle={() => toggle(u.id)}
                      onSelect={() => setSelected(u.id)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          {!mobile && selectedUnit && (
            <aside
              aria-label="Selected unit details"
              className={styles.inspector}
            >
              {details}
            </aside>
          )}
        </div>
        {mobile && selectedUnit && (
          <dialog
            ref={dialog}
            className={styles.mobileInspector}
            onCancel={(e) => {
              e.preventDefault();
              closeDetails();
            }}
            onClose={() => setSelected(null)}
            aria-label="Selected unit details"
          >
            {details}
          </dialog>
        )}
      </section>
      <details className={styles.sourceNotes}>
        <summary>
          Source &amp; checks{" "}
          <Badge variant="secondary">{structure.checks.length} notes</Badge>
        </summary>
        <p>
          {structure.source.label}. Loaded{" "}
          {new Date(structure.source.loadedAt).toLocaleString()}.
        </p>
        <p>
          Read-only. Branch and section names are grouped from employee records;
          they are not approved branch master records. Recorded HODs, site codes
          and location details are not connected by the temporary source.
        </p>
        <p>
          Inferred leads are suggestions from reporting lines. They do not grant
          authority or assign responsibilities to plans.
        </p>
        {structure.checks.length ? (
          <ul>
            {structure.checks.map((c, i) => (
              <li key={i}>
                {c.message}
                {c.unitId && (
                  <button
                    className={styles.textAction}
                    onClick={() => {
                      setSelected(c.unitId);
                    }}
                  >
                    View details
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No source gaps found by these checks.</p>
        )}
      </details>
    </>
  );
}

function PersonAvatar({ name, url }: { name: string; url: string | null }) {
  return (
    <Avatar>
      <AvatarImage src={photoUrl(url)} alt="" />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
function UnitCard({
  unit: u,
  density,
  x,
  y,
  childrenCount,
  open,
  selected,
  hit,
  flagged,
  onSelect,
  onToggle,
}: {
  unit: OrganisationUnit;
  density: ChartDensity;
  x: number;
  y: number;
  childrenCount: number;
  open: boolean;
  selected: boolean;
  hit: boolean;
  flagged: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const size = SIZES[density];
  const label =
    u.type === "BRANCH"
      ? "departments"
      : u.type === "DEPARTMENT"
        ? "sections"
        : "branches";
  return (
    <div
      className={styles.unitPosition}
      style={{ left: x, top: y, width: size.width }}
      data-unit-position={u.id}
      data-density={density}
    >
      <button
        id={`unit-${u.id}`}
        type="button"
        onClick={onSelect}
        aria-label={`${TYPE_LABEL[u.type]}: ${u.name}`}
        aria-pressed={selected}
        data-kind={u.type}
        data-density={density}
        title={`${TYPE_LABEL[u.type]}: ${u.name} · ${u.people.active} active${u.lead ? ` · ${u.lead.name}` : ""}`}
        data-hit={hit || undefined}
        className={styles.unitCard}
        style={{ height: size.height }}
      >
        {density === "cards" && (
          <span className={styles.unitType}>
            {u.type === "COMPANY" && <Building2 size={14} />}{" "}
            {TYPE_LABEL[u.type]}
            {flagged && <AlertTriangle aria-label="Source note" size={14} />}
          </span>
        )}
        {density !== "map" && (
          <strong title={u.name} className={styles.unitName}>
            {u.name}
          </strong>
        )}
        {density !== "map" && (
          <span className={styles.unitCount}>
            {u.people.active} active
            {u.people.inactive ? ` · ${u.people.inactive} inactive` : ""}
          </span>
        )}
        {density === "cards" && (
          <span className={styles.unitLead}>
            {u.lead ? (
              <>
                <PersonAvatar name={u.lead.name} url={u.lead.avatarUrl} />
                <span>
                  <b>{u.lead.name}</b>
                  <small>
                    {u.lead.basis === "RECORDED_HOD"
                      ? "Recorded HOD"
                      : "Inferred lead · unconfirmed"}
                  </small>
                </span>
              </>
            ) : (
              <small>
                {u.people.total ? "Lead not confirmed" : "No people recorded"}
              </small>
            )}
          </span>
        )}
      </button>
      {childrenCount > 0 && density !== "map" && (
        <button
          className={styles.expand}
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${label} in ${u.name}`}
          onClick={onToggle}
        >
          {open ? "− Hide" : "+ Show"} {childrenCount} {label}
        </button>
      )}
    </div>
  );
}

function UnitDetails({
  unit,
  structure,
  currentScope,
  onFocus,
  onClose,
}: {
  unit: OrganisationUnit;
  structure: OrganogramViewData;
  currentScope: string;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const index = useMemo(() => indexUnits(structure), [structure]),
    included = useMemo(() => within(index, unit.id), [index, unit.id]);
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(0),
    [status, setStatus] = useState("active");
  const people = structure.members.filter(
    (p) =>
      included.has(p.unitId) &&
      (status === "all" || (status === "active" ? p.active : !p.active)) &&
      `${p.name} ${p.jobTitle ?? ""}`
        .toLowerCase()
        .includes(term.toLowerCase()),
  );
  const checks = index.checksFor(unit.id),
    siblings = unit.departmentId
      ? structure.units.filter(
          (u) =>
            u.type === "DEPARTMENT" &&
            u.departmentId === unit.departmentId &&
            u.id !== unit.id,
        )
      : [];
  const shownPage = Math.min(
    page,
    Math.max(0, Math.ceil(people.length / 15) - 1),
  );
  return (
    <>
      <header className={styles.inspectorHeading}>
        <div>
          <Badge variant="secondary">{TYPE_LABEL[unit.type]}</Badge>
          <h2>{unit.name}</h2>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Close details"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className={styles.inspectorBody}>
        <p className={styles.hint}>
          {index
            .pathTo(unit.id)
            .slice(0, -1)
            .map((u) => u.name)
            .join(" / ") || "Company root"}
        </p>
        {index.childrenOf(unit.id).length > 0 &&
          unit.id !== (currentScope || "company") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFocus(unit.type === "COMPANY" ? "" : unit.id)}
            >
              {unit.type === "BRANCH"
                ? "View branch departments"
                : unit.type === "DEPARTMENT"
                  ? "View department sections"
                  : "View company"}
            </Button>
          )}
        <dl className={styles.facts}>
          <dt>People</dt>
          <dd>
            {unit.people.total} total · {unit.people.active} active, including{" "}
            {unit.people.probation} probation · {unit.people.inactive} inactive
          </dd>
          <dt>Lead</dt>
          <dd>
            {unit.lead ? (
              <>
                {unit.lead.name}
                {unit.lead.jobTitle && ` · ${unit.lead.jobTitle}`}
                <small>
                  {unit.lead.basis === "RECORDED_HOD"
                    ? "Recorded HOD in EMS"
                    : "Inferred from reporting; not a confirmed HOD or plan assignment."}
                </small>
              </>
            ) : (
              "Not confirmed. The available records do not establish a single lead."
            )}
          </dd>
          {unit.type === "BRANCH" && (
            <>
              <dt>Branch / site name</dt>
              <dd>{unit.branch ?? "Not recorded"}</dd>
              <dt>Type &amp; code</dt>
              <dd>Not provided by the current source</dd>
              <dt>Country, city &amp; address</dt>
              <dd>Not provided by the current source</dd>
              <dt>Departments</dt>
              <dd>
                {
                  index
                    .childrenOf(unit.id)
                    .filter((u) => u.type === "DEPARTMENT").length
                }
              </dd>
            </>
          )}
          {(unit.type === "DEPARTMENT" || unit.type === "SECTION") && (
            <>
              <dt>Branch scope</dt>
              <dd>
                {unit.branch ??
                  "Not recorded — this does not mean company-wide."}
              </dd>
            </>
          )}
        </dl>
        {siblings.length > 0 && (
          <div className={styles.hint}>
            The same department also appears at:
            {siblings.map((u) => (
              <button
                key={u.id}
                className={styles.textAction}
                onClick={() => onFocus(u.id)}
              >
                {u.branch ?? "Branch not recorded"}
              </button>
            ))}
          </div>
        )}
        {checks.map((c, i) => (
          <p key={i} className={styles.warning}>
            {c.message}
          </p>
        ))}
        <section aria-label="People in this unit" className={styles.people}>
          <h3>People in this unit</h3>
          <Input
            aria-label="Find people in selected unit"
            value={term}
            onChange={(e) => {
              setTerm(e.target.value);
              setPage(0);
            }}
            placeholder="Name or job title"
          />
          <label className={styles.selectLabel}>
            Employment status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="active">Active (includes probation)</option>
              <option value="inactive">Inactive</option>
              <option value="all">All records</option>
            </select>
          </label>
          <p role="status" className={styles.hint}>
            {people.length} matching people
          </p>
          <ul>
            {people.slice(shownPage * 15, (shownPage + 1) * 15).map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </ul>
          {people.length > 15 && (
            <div className={styles.pagination}>
              <Button
                size="sm"
                variant="outline"
                disabled={shownPage === 0}
                onClick={() => setPage(shownPage - 1)}
              >
                Previous
              </Button>
              <span>
                {shownPage + 1}/{Math.ceil(people.length / 15)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(shownPage + 1) * 15 >= people.length}
                onClick={() => setPage(shownPage + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function PersonRow({ person: p }: { person: StructurePerson }) {
  return (
    <li>
      <PersonAvatar name={p.name} url={p.avatarUrl} />
      <span>
        <b>{p.name}</b>
        <small>
          {p.jobTitle || "Position not recorded"} ·{" "}
          {p.probation ? "Probation" : p.active ? "Active" : "Inactive"}
        </small>
      </span>
    </li>
  );
}
