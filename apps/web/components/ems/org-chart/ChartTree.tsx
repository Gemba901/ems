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
  cardMode,
  type CardMode,
} from "./chart-layout";
import { Button } from "@/components/ui/button";
export type { TreeItem } from "./chart-layout";
const control =
  "rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-primary/10 disabled:opacity-40";
/** Shared canvas for people and future structural charts. Reporting data stays with the caller. */
export function ChartTree({
  items,
  renderCard,
  outline = false,
  storageKey,
  selectedId,
  fitRequest = 0,
  selectionRequest = 0,
  highlightedIds,
  defaultView = "readable",
}: {
  items: TreeItem[];
  renderCard: (
    id: string,
    presentation: { zoom: number; mode: CardMode },
  ) => ReactNode;
  outline?: boolean;
  storageKey?: string;
  selectedId?: string;
  fitRequest?: number;
  selectionRequest?: number;
  highlightedIds?: Set<string>;
  defaultView?: "readable" | "fit";
}) {
  const signature = items
    .map((item) => `${item.id}:${item.parentId ?? ""}`)
    .join("|");
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const layout = useMemo(
    () =>
      layoutChart(items, defaultView === "readable" ? size.width : undefined),
    [items, defaultView, size.width],
  );
  const [autoView, setAutoView] = useState(defaultView);
  const [manualScale, setManualScale] = useState<number | null>(null);
  const ready = useRef(false);
  const previousFitRequest = useRef(fitRequest);
  const previousDefaultView = useRef(defaultView);
  const pendingPosition = useRef<{ x: number; y: number } | null>(null);
  const anchor = useRef<{
    x: number;
    y: number;
    screenX?: number;
    screenY?: number;
  } | null>(null);
  const previousSelection = useRef(-1);
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
  const explicitFit =
    previousFitRequest.current !== fitRequest ||
    previousDefaultView.current !== defaultView;
  const zoom =
    manualScale ??
    (structureChanged && !explicitFit
      ? previousCamera.current!.zoom
      : autoView === "fit"
        ? fit
        : 1);
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
    if (!ready.current || !storageKey || !viewport.current || size.width <= 1)
      return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          signature,
          scale: manualScale,
          autoView,
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
          if (saved.autoView === "fit" || saved.autoView === "readable")
            setAutoView(saved.autoView);
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
        left +
          anchor.current.x * zoom -
          (anchor.current.screenX ?? box.clientWidth / 2),
      );
      box.scrollTop = Math.max(
        0,
        top +
          anchor.current.y * zoom -
          (anchor.current.screenY ?? box.clientHeight / 2),
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
    previousDefaultView.current = defaultView;
    anchor.current = null;
    branchAnchor.current = null;
    pendingPosition.current = null;
    setFrame(null);
    setManualScale(null);
    setAutoView(defaultView);
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
  }, [fitRequest, explicitFit, defaultView]);
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
    if (next === null) setAutoView("fit");
    setManualScale(next === null ? null : Math.max(minimum, Math.min(2, next)));
  };
  useLayoutEffect(() => {
    previousCamera.current = { signature, zoom };
    remember();
  }, [manualScale, size, signature, frame, zoom, autoView]);
  const centreSelected = () => {
    const box = viewport.current,
      point = selectedId ? layout.positions.get(selectedId) : undefined;
    if (!box || !point) return;
    if (outline) {
      const node = Array.from(
        box.querySelectorAll<HTMLElement>("[data-outline-id]"),
      ).find((n) => n.dataset.outlineId === selectedId);
      if (node)
        box.scrollTop = Math.max(
          0,
          node.offsetTop -
            box.offsetTop -
            box.clientHeight / 2 +
            node.clientHeight / 2,
        );
    } else {
      box.scrollLeft = Math.max(
        0,
        left + (point.x + CARD_WIDTH / 2) * zoom - box.clientWidth / 2,
      );
      box.scrollTop = Math.max(
        0,
        top + (point.y + CARD_HEIGHT / 2) * zoom - box.clientHeight / 2,
      );
    }
  };
  useLayoutEffect(() => {
    if (previousSelection.current === selectionRequest || size.width <= 1)
      return;
    previousSelection.current = selectionRequest;
    centreSelected();
  }, [selectionRequest, selectedId, layout, size, zoom]);
  useLayoutEffect(() => {
    const box = viewport.current;
    if (!box || outline) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const bounds = box.getBoundingClientRect(),
        screenX = event.clientX - bounds.left,
        screenY = event.clientY - bounds.top;
      anchor.current = {
        x: (box.scrollLeft + screenX - left) / zoom,
        y: (box.scrollTop + screenY - top) / zoom,
        screenX,
        screenY,
      };
      branchAnchor.current = null;
      setFrame(null);
      setManualScale(
        Math.max(
          minimum,
          Math.min(2, zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)),
        ),
      );
    };
    box.addEventListener("wheel", wheel, { passive: false });
    return () => box.removeEventListener("wheel", wheel);
  }, [outline, zoom, left, top, minimum]);
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Overview opens with names and photos. Drag to pan; Ctrl + wheel
            zooms.
          </span>
          <div
            className="flex flex-wrap items-center gap-1"
            role="group"
            aria-label="Chart zoom"
          >
            <Button variant="ghost"
              type="button"
              className={`${control} h-auto whitespace-normal`}
              aria-label="Zoom out"
              disabled={zoom <= minimum}
              onClick={() => changeZoom(zoom / 1.25)}
            >
              −
            </Button>
            <output
              aria-label="Zoom level"
              className="w-14 text-center tabular-nums"
            >
              {zoom < 0.01
                ? "<1"
                : zoom < 0.1
                  ? (zoom * 100).toFixed(1)
                  : Math.round(zoom * 100)}
              %
            </output>
            <Button variant="ghost"
              type="button"
              className={`${control} h-auto whitespace-normal`}
              aria-label="Zoom in"
              disabled={zoom >= 2}
              onClick={() => changeZoom(zoom * 1.25)}
            >
              +
            </Button>
            <Button variant="ghost"
              type="button"
              className={`${control} h-auto whitespace-normal`}
              onClick={() => changeZoom(1)}
            >
              100%
            </Button>
            {selectedId && (
              <Button variant="ghost"
                type="button"
                className={`${control} h-auto whitespace-normal`}
                onClick={centreSelected}
              >
                Centre selected
              </Button>
            )}
            <Button variant="ghost"
              type="button"
              className={`h-auto whitespace-normal ${control} !border-primary/50 !text-primary`}
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
            </Button>
          </div>
        </div>
      )}
      <div
        ref={viewport}
        role="region"
        aria-label={outline ? "Reporting outline" : "Reporting chart canvas"}
        tabIndex={0}
        className="relative overflow-auto rounded-xl border border-border bg-card focus-visible:outline-ring"
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
                data-outline-id={item.id}
                className="border-l-2 border-primary/30 pl-3"
                style={{ marginLeft: Math.min(item.depth, 8) * 14 }}
              >
                <div style={{ maxWidth: CARD_WIDTH + 80, height: CARD_HEIGHT }}>
                  {renderCard(item.id, { zoom: 1, mode: "full" })}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div
            data-chart-surface="true"
            style={{
              position: "relative",
              overflow: "hidden",
              width: surfaceWidth,
              height: surfaceHeight,
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
                    stroke={
                      highlightedIds?.has(edge.child) &&
                      highlightedIds?.has(edge.parent)
                        ? "#7c3aed"
                        : "#a78bfa"
                    }
                    strokeWidth={Math.max(
                      2,
                      (highlightedIds?.has(edge.child) &&
                      highlightedIds?.has(edge.parent)
                        ? 2.5
                        : 1) / zoom,
                    )}
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
                  {renderCard(point.id, { zoom, mode: cardMode(zoom) })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {!outline && zoom < 0.5 && (
        <p className="text-xs text-muted-foreground">
          {zoom < 0.3
            ? "Company shape: colours show departments. Select a block for readable person and team details below, or zoom in for names."
            : "Compact view: select a person for team details. Zoom in for photos and full cards."}
        </p>
      )}
    </div>
  );
}
