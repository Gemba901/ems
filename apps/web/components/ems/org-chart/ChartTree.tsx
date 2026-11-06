"use client";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  fitChart,
  layoutChart,
  type TreeItem,
} from "./chart-layout";
export type { TreeItem } from "./chart-layout";
const control =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-violet-50 disabled:opacity-40";
/** Shared canvas for people and future structural charts. Reporting data stays with the caller. */
export function ChartTree({
  items,
  renderCard,
  outline = false,
  storageKey,
  selectedId,
  fitRequest = 0,
}: {
  items: TreeItem[];
  renderCard: (id: string) => ReactNode;
  outline?: boolean;
  storageKey?: string;
  selectedId?: string;
  fitRequest?: number;
}) {
  const layout = useMemo(() => layoutChart(items), [items]);
  const signature = items
    .map((item) => `${item.id}:${item.parentId ?? ""}`)
    .join("|");
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [manualScale, setManualScale] = useState<number | null>(null);
  const ready = useRef(false);
  const previousFitRequest = useRef(fitRequest);
  const pendingPosition = useRef<{ x: number; y: number } | null>(null);
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  // A layout edit is not a zoom command. Freeze the last displayed scale when
  // a branch changes, including when the previous view was automatically fitted.
  type Frame = { left: number; top: number; width: number; height: number };
  const [frame, setFrame] = useState<Frame | null>(null);
  const previousCamera = useRef<{ signature: string; zoom: number } | null>(
    null,
  );
  const loadedStorage = useRef<string | undefined>(undefined);
  const branchAnchor = useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  const fit = fitChart(layout.width, layout.height, size.width, size.height);
  const structureChanged =
    !!previousCamera.current && previousCamera.current.signature !== signature;
  const explicitFit = previousFitRequest.current !== fitRequest;
  const zoom =
    manualScale ??
    (structureChanged && !explicitFit ? previousCamera.current!.zoom : fit);
  const minimum = Math.min(0.05, fit);
  const left =
    frame?.left ?? Math.max(0, (size.width - layout.width * zoom) / 2);
  const top = frame?.top ?? 0;
  const surfaceWidth = Math.max(
    Math.max(1, size.width - 1),
    frame?.width ?? 0,
    left + layout.width * zoom,
  );
  const surfaceHeight = Math.max(
    Math.max(1, size.height - 1),
    frame?.height ?? 0,
    top + layout.height * zoom,
  );
  const remember = () => {
    if (!ready.current || !storageKey || !viewport.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          signature,
          scale: manualScale,
          x: viewport.current.scrollLeft,
          y: viewport.current.scrollTop,
          frame,
        }),
      );
    } catch {}
  };
  useLayoutEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const measure = () => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [outline]);
  useLayoutEffect(() => {
    // Restore only when entering this view, not every time its nodes change.
    if (ready.current && loadedStorage.current === storageKey) return;
    loadedStorage.current = storageKey;
    ready.current = false;
    if (storageKey)
      try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        if (saved?.signature === signature) {
          if (
            Number.isFinite(saved.scale) &&
            saved.scale > 0 &&
            saved.scale <= 2
          )
            setManualScale(saved.scale);
          if (
            saved.frame &&
            ["left", "top", "width", "height"].every(
              (key) =>
                Number.isFinite(saved.frame[key]) && saved.frame[key] >= 0,
            )
          )
            setFrame(saved.frame);
          pendingPosition.current = {
            x: Number(saved.x) || 0,
            y: Number(saved.y) || 0,
          };
        }
      } catch {}
    ready.current = true;
  }, [storageKey, signature]);
  useLayoutEffect(() => {
    if (structureChanged && !explicitFit && manualScale === null)
      setManualScale(zoom);
  }, [structureChanged, explicitFit, manualScale, zoom]);
  useLayoutEffect(() => {
    const box = viewport.current;
    if (!box || size.width <= 1) return;
    const held = branchAnchor.current;
    if (held && structureChanged && !explicitFit) {
      branchAnchor.current = null;
      const point = layout.positions.get(held.id);
      if (point) {
        // Preserve this card's screen coordinates, even when a collapsed tree
        // becomes smaller than the viewport. Spare canvas space prevents the
        // browser from clamping scroll and pulling the clicked manager away.
        const nextLeft = Math.max(left, held.x - point.x * zoom, 0);
        const nextTop = Math.max(top, held.y - point.y * zoom, 0);
        const x = nextLeft + point.x * zoom - held.x;
        const y = nextTop + point.y * zoom - held.y;
        setFrame({
          left: nextLeft,
          top: nextTop,
          width: Math.max(
            size.width,
            nextLeft + layout.width * zoom,
            x + size.width,
          ),
          height: Math.max(
            size.height,
            nextTop + layout.height * zoom,
            y + size.height,
          ),
        });
        pendingPosition.current = { x, y };
        return; // scroll after the new canvas dimensions have been committed
      }
    }
    if (pendingPosition.current) {
      box.scrollLeft = pendingPosition.current.x;
      box.scrollTop = pendingPosition.current.y;
      pendingPosition.current = null;
    } else if (anchor.current) {
      box.scrollLeft = Math.max(
        0,
        left + anchor.current.x * zoom - box.clientWidth / 2,
      );
      box.scrollTop = Math.max(
        0,
        top + anchor.current.y * zoom - box.clientHeight / 2,
      );
      anchor.current = null;
    } else if (manualScale === null && !structureChanged) {
      box.scrollLeft = 0;
      box.scrollTop = 0;
    }
  }, [
    zoom,
    size,
    layout,
    manualScale,
    frame,
    structureChanged,
    explicitFit,
    left,
    top,
  ]);
  useLayoutEffect(() => {
    if (!explicitFit) return;
    previousFitRequest.current = fitRequest;
    anchor.current = null;
    branchAnchor.current = null;
    pendingPosition.current = null;
    setFrame(null);
    setManualScale(null);
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
  }, [fitRequest, explicitFit]);
  const changeZoom = (next: number | null) => {
    const box = viewport.current;
    branchAnchor.current = null;
    if (box && next !== null) {
      const point = selectedId ? layout.positions.get(selectedId) : undefined;
      anchor.current = point
        ? { x: point.x + CARD_WIDTH / 2, y: point.y + CARD_HEIGHT / 2 }
        : {
            x: (box.scrollLeft + box.clientWidth / 2 - left) / zoom,
            y: (box.scrollTop + box.clientHeight / 2 - top) / zoom,
          };
    }
    setFrame(null);
    setManualScale(next === null ? null : Math.max(minimum, Math.min(2, next)));
  };
  useLayoutEffect(() => {
    previousCamera.current = { signature, zoom };
    remember();
  }, [manualScale, size, signature, frame, zoom]);
  return (
    <div
      className="space-y-2"
      onClickCapture={(event) => {
        if (outline) return;
        const target = event.target;
        if (
          !(target instanceof Element) ||
          !target.closest("button[aria-expanded]")
        )
          return;
        const id = target
          .closest("[data-chart-node]")
          ?.getAttribute("data-chart-node");
        const point = id ? layout.positions.get(id) : undefined;
        const box = viewport.current;
        if (!id || !point || !box) return;
        branchAnchor.current = {
          id,
          x: left + point.x * zoom - box.scrollLeft,
          y: top + point.y * zoom - box.scrollTop,
        };
        setManualScale(zoom);
      }}
    >
      {!outline && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            Expand teams without changing zoom. Use Fit to see the whole
            displayed tree.
          </span>
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label="Chart zoom"
          >
            <button
              type="button"
              className={control}
              aria-label="Zoom out"
              disabled={zoom <= minimum}
              onClick={() => changeZoom(zoom / 1.25)}
            >
              −
            </button>
            <output
              aria-label="Zoom level"
              className="w-14 text-center tabular-nums"
            >
              {zoom < 0.01 ? "<1" : Math.round(zoom * 100)}%
            </output>
            <button
              type="button"
              className={control}
              aria-label="Zoom in"
              disabled={zoom >= 2}
              onClick={() => changeZoom(zoom * 1.25)}
            >
              +
            </button>
            <button
              type="button"
              className={control}
              onClick={() => changeZoom(1)}
            >
              100%
            </button>
            <button
              type="button"
              className={`${control} !border-violet-300 !text-violet-800`}
              onClick={() => {
                anchor.current = null;
                pendingPosition.current = null;
                changeZoom(null);
                if (viewport.current) {
                  viewport.current.scrollLeft = 0;
                  viewport.current.scrollTop = 0;
                }
              }}
            >
              Fit
            </button>
          </div>
        </div>
      )}
      <div
        ref={viewport}
        role="region"
        aria-label={outline ? "Reporting outline" : "Reporting chart canvas"}
        tabIndex={0}
        className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 focus-visible:outline-violet-600"
        style={{
          height: "clamp(300px, 62vh, 680px)",
          scrollbarGutter: "stable",
          overflowAnchor: "none",
          cursor: outline ? undefined : "grab",
        }}
        onScroll={remember}
        onPointerDown={(e) => {
          if (
            outline ||
            e.pointerType !== "mouse" ||
            e.button !== 0 ||
            (e.target as Element).closest("button,a,input")
          )
            return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.style.cursor = "grabbing";
          e.preventDefault();
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            e.currentTarget.scrollLeft =
              drag.current.left - e.clientX + drag.current.x;
            e.currentTarget.scrollTop =
              drag.current.top - e.clientY + drag.current.y;
          }
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.style.cursor = outline ? "" : "grab";
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {outline ? (
          <ul className="space-y-3 p-3" aria-label="Reporting outline people">
            {layout.order.map((item) => (
              <li
                key={item.id}
                className="border-l-2 border-violet-200 pl-3"
                style={{ marginLeft: Math.min(item.depth, 8) * 14 }}
              >
                <div style={{ maxWidth: CARD_WIDTH + 80, height: CARD_HEIGHT }}>
                  {renderCard(item.id)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div
            data-chart-surface="true"
            style={{
              position: "relative",
              width: surfaceWidth,
              height: surfaceHeight,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left,
                top,
                width: layout.width,
                height: layout.height,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <svg
                aria-hidden="true"
                width={layout.width}
                height={layout.height}
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                }}
              >
                {layout.edges.map((edge) => (
                  <path
                    key={edge.child}
                    data-chart-edge={`${edge.parent}:${edge.child}`}
                    d={edge.path}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth={Math.max(2, 1.25 / zoom)}
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
              {[...layout.positions.values()].map((point) => (
                <div
                  key={point.id}
                  data-chart-node={point.id}
                  style={{
                    position: "absolute",
                    left: point.x,
                    top: point.y,
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                  }}
                >
                  {renderCard(point.id)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {!outline && zoom < 0.5 && (
        <p className="text-xs text-slate-600">
          Fitted overview. Click a person to read their details, or focus a team
          to enlarge its branch.
        </p>
      )}
    </div>
  );
}
