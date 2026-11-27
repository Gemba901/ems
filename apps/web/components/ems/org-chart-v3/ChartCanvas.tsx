"use client";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  active,
  personColour,
  layoutForViewport,
  type Drawing,
  type Index,
  type Node as ChartNode,
} from "./model";
import {
  hitTestPerson,
  anchorCamera,
  centreCamera,
  fitCamera,
  overviewCamera,
  limitCamera,
  settleCamera,
  screenLine,
  zoomCamera,
  zoomSelectedCamera,
  spotCamera,
  type Camera,
} from "./camera";
import { PersonCard } from "./PersonCard";
import styles from "./chart-v3.module.css";
import { Button } from "@/components/ui/button";
export type { Camera } from "./camera";
export type CanvasCommand = {
  serial: number;
  kind:
    | "fit"
    | "overview"
    | "centre"
    | "restore"
    | "readable"
    | "spot"
    | "zoomIn"
    | "zoomOut";
  id?: string;
  camera?: Camera;
};
const NO_ISSUES: string[] = [];
/** Camera movement does not rerender a person's contents. Positions are local to a
 * viewport-sized layer, periodically rebased so large charts never need huge surfaces. */
const LayerNode = memo(function LayerNode({
  node,
  visible,
  index,
  colours,
  colourBy,
  zoom,
  overview,
  selected,
  matches,
  included,
  open,
  inactiveOnly,
  searchMatch,
  x,
  y,
  onPick,
  onToggle,
}: {
  node: ChartNode;
  visible: boolean;
  index: Index;
  colours: Map<string, string>;
  colourBy: "department" | "branch";
  zoom: number;
  overview: boolean;
  selected: boolean;
  matches: Set<string>;
  included: Set<string>;
  open: Set<string>;
  inactiveOnly: boolean;
  searchMatch?: boolean;
  x: number;
  y: number;
  onPick: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const pick = useCallback(() => onPick(node.id), [onPick, node.id]);
  const toggle = useCallback(() => onToggle(node.id), [onToggle, node.id]);
  const person = index.byId.get(node.id);
  // Blank tiles need no font updates until they cross a display-mode threshold.
  const cardZoom =
    !overview && zoom < 0.22 ? 0.1 : !overview && zoom < 0.4 ? 0.3 : zoom;
  const content = useRef<ReactNode>(null);
  const position = useRef({
    left: x,
    top: y,
    width: node.width * zoom,
    height: node.height * zoom,
  });
  if (visible) {
    position.current = {
      left: x,
      top: y,
      width: node.width * zoom,
      height: node.height * zoom,
    };
    content.current = (
      <div
        style={{
          width: node.width,
          height: node.height,
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {node.body ? (
          <div
            className={styles.bodyNode}
            style={{ fontSize: `${Math.max(19, Math.min(36, 12 / zoom))}px` }}
          >
            {zoom >= 0.24 ? (
              node.body
            ) : (
              <span className={styles.srOnly}>{node.body}</span>
            )}
          </div>
        ) : (
          person && (
            <PersonCard
              person={person}
              colour={personColour(person, colours, colourBy)}
              zoom={cardZoom}
              compact={overview}
              selected={selected}
              context={!matches.has(node.id)}
              issues={index.issues.get(node.id) || NO_ISSUES}
              kids={
                (index.children.get(node.id) || []).filter((id) =>
                  included.has(id),
                ).length
              }
              open={open.has(node.id)}
              onPick={pick}
              onToggle={toggle}
            />
          )
        )}
      </div>
    );
  }
  return (
    <div
      data-chart-node={visible ? node.id : undefined}
      hidden={!visible}
      className={styles.screenNode}
      data-context-muted={
        inactiveOnly && !node.body && !matches.has(node.id) && !selected
      }
      data-search-muted={searchMatch === false && !node.body}
      style={position.current}
    >
      {content.current}
    </div>
  );
});
export function ChartCanvas({
  overview = false,
  index,
  matches,
  included,
  open,
  selected,
  colours,
  colourBy,
  recent,
  command,
  onPick,
  onToggle,
  onCamera,
  details,
  mobileDetails,
  searchMatches,
  personalMatches,
  markerLabel,
  colourKey,
  actions,
  context,
  showInactive,
  inactiveOnly,
}: {
  overview?: boolean;
  index: Index;
  matches: Set<string>;
  included: Set<string>;
  open: Set<string>;
  selected: string;
  colours: Map<string, string>;
  colourBy: "department" | "branch";
  recent: string[];
  command: CanvasCommand;
  onPick: (id: string) => void;
  onToggle: (id: string) => void;
  onCamera: (c: Camera) => void;
  details: ReactNode;
  mobileDetails?: (actions: ReactNode) => ReactNode;
  searchMatches?: Set<string>;
  personalMatches: Set<string>;
  markerLabel: string;
  colourKey: ReactNode;
  actions: ReactNode;
  context: ReactNode;
  showInactive: boolean;
  inactiveOnly: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null),
    lastCommand = useRef(-1),
    anchor = useRef<{ drawing: Drawing; id: string } | null>(null);
  const [size, setSize] = useState({ width: 1000, height: 600 }),
    [ready, setReady] = useState(false),
    [phoneLayout, setPhoneLayout] = useState(false);
  const overviewForViewport = useCallback(
    (drawing: Drawing, size: { width: number; height: number }) =>
      overviewCamera(drawing, size, phoneLayout),
    [phoneLayout],
  );
  const [readReturn, setReadReturn] = useState<{
    camera: Camera;
    fitted: false | "fit" | "overview";
  } | null>(null);
  const [camera, setCamera] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const membershipKey = useMemo(
    () =>
      JSON.stringify([
        [...included].sort(),
        [...open].filter((id) => included.has(id)).sort(),
      ]),
    [included, open],
  );
  const membership = useMemo(() => {
    const [people, teams] = JSON.parse(membershipKey) as [string[], string[]];
    return { included: new Set(people), open: new Set(teams) };
  }, [membershipKey]);
  const drawing = useMemo(
    () =>
      layoutForViewport(
        index,
        membership.included,
        membership.open,
        size.width,
        size.height,
        overview,
      ),
    [overview, index, membership, size.width, size.height],
  );
  const live = useRef({ camera, size, drawing });
  const events = useRef({ onPick, onToggle });
  events.current = { onPick, onToggle };
  const frame = useRef<number | null>(null);
  const pendingCamera = useRef<Camera | null>(null);
  const fitted = useRef<false | "fit" | "overview">(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  live.current = { camera, size, drawing };
  const moveCamera = (
    next: SetStateAction<Camera>,
    finish = true,
    manual = true,
  ) => {
    if (finish && settleTimer.current) {
      clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    if (manual) fitted.current = false;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const previous = pendingCamera.current || live.current.camera;
    pendingCamera.current = null;
    const value = (finish ? settleCamera : limitCamera)(
      typeof next === "function" ? next(previous) : next,
      live.current.drawing,
      live.current.size,
    );
    live.current.camera = value;
    setCamera(value);
  };
  const queueCamera = (next: (previous: Camera) => Camera) => {
    pendingCamera.current = next(pendingCamera.current || live.current.camera);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const value = pendingCamera.current;
      if (value) moveCamera(value, false);
    });
  };
  const scheduleSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      moveCamera((c) => c);
    }, 140);
  };
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    },
    [],
  );
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (width <= 0 || height <= 0) return;
      setPhoneLayout(window.innerWidth <= 760);
      const previous = live.current.size;
      if (previous.width !== width || previous.height !== height) {
        if (lastCommand.current >= 0)
          setCamera((c) =>
            fitted.current
              ? fitted.current === "overview"
                ? overviewCamera(
                    live.current.drawing,
                    { width, height },
                    window.innerWidth <= 760,
                  )
                : fitCamera(live.current.drawing, { width, height })
              : settleCamera(
                  {
                    ...c,
                    x: c.x + (width - previous.width) / 2,
                    y: c.y + (height - previous.height) / 2,
                  },
                  live.current.drawing,
                  { width, height },
                ),
          );
        setSize({ width, height });
      }
      setReady(true);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    if (command.serial !== lastCommand.current) {
      lastCommand.current = command.serial;
      anchor.current = null;
      moveCamera(
        (c) =>
          command.kind === "restore" && command.camera
            ? command.camera
            : command.kind === "spot"
              ? spotCamera(drawing, size, c, command.id)
              : command.kind === "zoomIn" || command.kind === "zoomOut"
                ? (() => {
                    const n = drawing.nodes.find((n) => n.id === command.id);
                    const point = n
                      ? {
                          x: (n.x + n.width / 2) * c.zoom + c.x,
                          y: (n.y + n.height / 2) * c.zoom + c.y,
                        }
                      : { x: size.width / 2, y: size.height / 2 };
                    return spotCamera(
                      drawing,
                      size,
                      zoomCamera(
                        c,
                        c.zoom * (command.kind === "zoomIn" ? 1.5 : 1 / 1.5),
                        point,
                      ),
                      command.id,
                    );
                  })()
                : command.kind === "overview"
                  ? overviewForViewport(drawing, size)
                  : command.kind === "fit"
                    ? fitCamera(drawing, size)
                    : centreCamera(
                        drawing,
                        size,
                        c,
                        command.id,
                        command.kind === "readable",
                      ),
        true,
        false,
      );
      const fit = fitCamera(drawing, size);
      const same = (expected: Camera) =>
        command.kind === "restore" &&
        !!command.camera &&
        Math.abs(command.camera.zoom - expected.zoom) < 0.000001 &&
        Math.abs(command.camera.x - expected.x) < 0.5 &&
        Math.abs(command.camera.y - expected.y) < 0.5;
      fitted.current =
        command.kind === "overview" ||
        (overview && same(overviewForViewport(drawing, size)))
          ? "overview"
          : command.kind === "fit" || same(fit)
            ? "fit"
            : false;
    } else if (anchor.current) {
      const a = anchor.current;
      anchor.current = null;
      moveCamera((c) => anchorCamera(c, a.drawing, drawing, a.id));
    } else
      moveCamera(
        (c) =>
          fitted.current
            ? (fitted.current === "overview" ? overviewForViewport : fitCamera)(
                drawing,
                size,
              )
            : command.kind === "spot"
              ? spotCamera(drawing, size, c, selected)
              : c,
        true,
        false,
      );
  }, [drawing, command, ready, size, overviewForViewport]);
  useEffect(() => {
    setReadReturn(null);
  }, [drawing, selected, command.serial, phoneLayout]);
  useEffect(() => {
    if (ready) onCamera(camera);
  }, [camera, ready, onCamera]);
  const zoom = (next: number) =>
    moveCamera((c) => zoomSelectedCamera(drawing, size, c, next, selected));
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { size: s } = live.current;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? s.height : 1;
      if (e.ctrlKey || e.metaKey) {
        const box = el.getBoundingClientRect();
        queueCamera((c) =>
          zoomCamera(c, c.zoom * Math.exp(-e.deltaY * unit * 0.003), {
            x: e.clientX - box.left,
            y: e.clientY - box.top,
          }),
        );
      } else {
        queueCamera((c) => ({
          ...c,
          x: c.x - (e.shiftKey ? e.deltaY : e.deltaX) * unit,
          y: c.y - (e.shiftKey ? 0 : e.deltaY) * unit,
        }));
      }
      scheduleSettle();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const pointers = useRef(
    new Map<
      number,
      { x: number; y: number; startX: number; startY: number; type: string }
    >(),
  );
  const gesture = useRef({ dragged: false, pinched: false });
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<string | undefined>();
  const hoverFrame = useRef<number | null>(null);
  const hoverPoint = useRef<{ x: number; y: number } | null>(null);
  const pickNode = useCallback((id: string) => events.current.onPick(id), []);
  const toggle = useCallback((id: string) => {
    anchor.current = { drawing: live.current.drawing, id };
    events.current.onToggle(id);
  }, []);
  const clearHover = () => {
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = null;
    hoverPoint.current = null;
    setHovered(undefined);
  };
  const hover = (x: number, y: number) => {
    hoverPoint.current = { x, y };
    if (hoverFrame.current !== null) return;
    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = null;
      const el = viewport.current,
        p = hoverPoint.current;
      if (!el || !p || pointers.current.size) return;
      const rect = el.getBoundingClientRect();
      setHovered(
        hitTestPerson(
          live.current.drawing,
          live.current.camera,
          { x: p.x - rect.left, y: p.y - rect.top },
          5,
          live.current.size,
        ),
      );
    });
  };
  const stopPointer = (
    id: number,
    cancelled = false,
    point?: { x: number; y: number },
  ) => {
    const pointer = pointers.current.get(id);
    if (!pointer) return;
    pointers.current.delete(id);
    const tap =
      !cancelled &&
      !gesture.current.dragged &&
      !gesture.current.pinched &&
      point &&
      Math.hypot(point.x - pointer.startX, point.y - pointer.startY) <=
        (pointer.type === "touch" ? 8 : 4);
    if (!pointers.current.size) {
      moveCamera((c) => c);
      setDragging(false);
      if (tap && viewport.current) {
        const rect = viewport.current.getBoundingClientRect();
        const id = hitTestPerson(
          live.current.drawing,
          live.current.camera,
          { x: point.x - rect.left, y: point.y - rect.top },
          pointer.type === "touch" ? 12 : 5,
          live.current.size,
        );
        if (id) pickNode(id);
      }
    }
    // Pointer gestures are handled here; native keyboard/assistive clicks still reach cards.
    suppressClick.current = true;
  };
  useEffect(() => {
    clearHover();
  }, [camera, drawing]);
  const chain = new Set(
    selected ? [selected, ...index.ancestors(selected)] : [],
  );
  const recentChildren = new Set(
    recent.flatMap((id) => index.children.get(id) || []),
  );
  const projected = drawing.nodes
    .map((n) => ({
      ...n,
      node: n,
      sx: n.x * camera.zoom + camera.x,
      sy: n.y * camera.zoom + camera.y,
      sw: n.width * camera.zoom,
      sh: n.height * camera.zoom,
    }))
    .filter(
      (n) =>
        n.sx + n.sw >= -100 &&
        n.sy + n.sh >= -100 &&
        n.sx <= size.width + 100 &&
        n.sy <= size.height + 100,
    );
  const visibleKey = JSON.stringify(projected.map((n) => n.id));
  const visibleIds = useMemo(
    () => new Set<string>(JSON.parse(visibleKey)),
    [visibleKey],
  );
  // Reuse fitted tiles during Read/Zoom back. Bound retention for larger companies.
  const layerNodes = useMemo(
    () =>
      drawing.nodes.length <= 2000
        ? drawing.nodes
        : drawing.nodes.filter((n) => visibleIds.has(n.id)),
    [drawing, visibleIds],
  );
  const lines = drawing.lines
    .map((l) => screenLine(l, camera, size))
    .filter((l): l is NonNullable<typeof l> => !!l);
  const uniqueLines = new Map<string, (typeof lines)[number]>();
  lines.forEach((l) => uniqueLines.set(`${l.x1}:${l.y1}:${l.x2}:${l.y2}`, l));
  const originX = Math.floor(camera.x / 512) * 512;
  const originY = Math.floor(camera.y / 512) * 512;
  const layerOffset = { x: camera.x - originX, y: camera.y - originY };
  const basePath = [...uniqueLines.values()]
    .map((l) => `M${l.x1} ${l.y1}L${l.x2} ${l.y2}`)
    .join("");
  const recentPath = lines
    .filter((l) => recentChildren.has(l.child))
    .map((l) => `M${l.x1} ${l.y1}L${l.x2} ${l.y2}`)
    .join("");
  const nodeElements = useMemo(
    () =>
      layerNodes.map((n) => (
        <LayerNode
          key={n.id}
          node={n}
          visible={visibleIds.has(n.id)}
          index={index}
          colours={colours}
          colourBy={colourBy}
          zoom={visibleIds.has(n.id) ? camera.zoom : 0}
          overview={overview}
          selected={selected === n.id}
          matches={matches}
          included={included}
          open={open}
          inactiveOnly={inactiveOnly}
          searchMatch={searchMatches ? searchMatches.has(n.id) : undefined}
          x={visibleIds.has(n.id) ? n.x * camera.zoom + originX : 0}
          y={visibleIds.has(n.id) ? n.y * camera.zoom + originY : 0}
          onPick={pickNode}
          onToggle={toggle}
        />
      )),
    [
      layerNodes,
      visibleIds,
      index,
      colours,
      colourBy,
      camera.zoom,
      overview,
      selected,
      matches,
      included,
      open,
      inactiveOnly,
      searchMatches,
      originX,
      originY,
      pickNode,
      toggle,
    ],
  );
  const hoveredNode = projected.find((n) => n.id === hovered);
  const expectedFit = fitCamera(drawing, size);
  const isFitted =
    Math.abs(camera.zoom - expectedFit.zoom) < 0.00001 &&
    Math.abs(camera.x - expectedFit.x) < 1 &&
    Math.abs(camera.y - expectedFit.y) < 1;
  const fit = () => {
    setReadReturn(null);
    fitted.current = "fit";
    moveCamera(fitCamera(drawing, size), true, false);
  };
  const readOrReturn = () => {
    if (readReturn) {
      fitted.current = readReturn.fitted;
      moveCamera(readReturn.camera, true, false);
      setReadReturn(null);
    } else {
      setReadReturn({
        camera: pendingCamera.current || live.current.camera,
        fitted: fitted.current,
      });
      moveCamera((c) => centreCamera(drawing, size, c, selected, true));
    }
  };
  const readAction = (
    <Button variant="ghost"
      type="button"
      onClick={readOrReturn}
      title={
        readReturn
          ? "Return to the view before Read card"
          : "Zoom in to read this person's card"
      }
    >
      {readReturn ? "Zoom back" : "Read card"}
    </Button>
  );
  return (
    <section className={styles.canvasSection} aria-label="Organisation chart">
      <div className={styles.canvasControls}>
        <div className={styles.controlRow}>
          {actions}
          <div
            className={styles.zoomControls}
            role="group"
            aria-label="Map position and zoom"
          >
            <div className={styles.zoomSteps}>
              <Button variant="ghost"
                type="button"
                aria-pressed={isFitted}
                title="Fit the opened chart"
                onClick={fit}
              >
                Fit
              </Button>
              <Button variant="ghost"
                type="button"
                aria-label="Zoom out"
                disabled={camera.zoom <= 0.0001}
                onClick={() => zoom(camera.zoom / 1.2)}
              >
                −
              </Button>
              <Button variant="ghost"
                type="button"
                aria-label="Set zoom to 100 percent"
                title="Set zoom to 100%"
                onClick={() => zoom(1)}
              >
                {camera.zoom < 0.01
                  ? (camera.zoom * 100).toFixed(2)
                  : Math.round(camera.zoom * 100)}
                %
              </Button>
              <Button variant="ghost"
                type="button"
                aria-label="Zoom in"
                disabled={camera.zoom >= 2}
                onClick={() => zoom(camera.zoom * 1.2)}
              >
                +
              </Button>
            </div>
            {selected && (
              <div className={styles.selectionTools}>
                {phoneLayout && !mobileDetails && readAction}
                <Button variant="ghost"
                  type="button"
                  onClick={() =>
                    moveCamera((c) => centreCamera(drawing, size, c, selected))
                  }
                >
                  Centre selected
                </Button>
              </div>
            )}
          </div>
        </div>
        {context}
        {overview &&
          !phoneLayout &&
          fitted.current === "overview" &&
          expectedFit.zoom < 0.55 && (
            <p className={styles.overviewNote} role="status">
              Names kept readable. Drag to see the remaining people, or use Fit
              to see the whole overview at a smaller size.
            </p>
          )}
      </div>
      {phoneLayout && mobileDetails && (
        <div className={styles.mobileSelectionDock}>
          {mobileDetails(readAction)}
        </div>
      )}
      <div className={styles.canvasWrap} data-details={!!details}>
        <div
          ref={viewport}
          data-chart-viewport="v3"
          data-camera={JSON.stringify(camera)}
          data-dragging={dragging}
          data-hovering={!!hovered}
          title={hovered ? index.byId.get(hovered)?.name : undefined}
          className={styles.viewport}
          tabIndex={0}
          aria-label="Chart canvas. Drag or use arrow keys to move; Control and mouse wheel to zoom. Home fits the chart."
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === "Home") {
              e.preventDefault();
              fit();
            } else if (e.key === "+" || e.key === "=") {
              e.preventDefault();
              zoom(camera.zoom * 1.2);
            } else if (e.key === "-") {
              e.preventDefault();
              zoom(camera.zoom / 1.2);
            } else if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                e.key,
              )
            ) {
              e.preventDefault();
              moveCamera(
                (c) => ({
                  ...c,
                  x:
                    c.x +
                    (e.key === "ArrowLeft"
                      ? 60
                      : e.key === "ArrowRight"
                        ? -60
                        : 0),
                  y:
                    c.y +
                    (e.key === "ArrowUp"
                      ? 60
                      : e.key === "ArrowDown"
                        ? -60
                        : 0),
                }),
                false,
              );
              scheduleSettle();
            }
          }}
          onPointerDown={(e) => {
            if (!pointers.current.size) suppressClick.current = false;
            const target = e.target as Element;
            if (
              e.button !== 0 ||
              (target.closest("button,a,input") &&
                !target.closest("button[data-mode]"))
            )
              return;
            if (!pointers.current.size) {
              gesture.current = { dragged: false, pinched: false };
              suppressClick.current = false;
            }
            pointers.current.set(e.pointerId, {
              x: e.clientX,
              y: e.clientY,
              startX: e.clientX,
              startY: e.clientY,
              type: e.pointerType,
            });
            if (pointers.current.size > 1) gesture.current.pinched = true;
            clearHover();
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.focus({ preventScroll: true });
            e.preventDefault();
          }}
          onPointerMove={(e) => {
            const old = pointers.current.get(e.pointerId);
            if (!old) {
              if (
                e.pointerType !== "touch" &&
                !(e.target as Element).closest("button:not([data-mode])")
              )
                hover(e.clientX, e.clientY);
              else clearHover();
              return;
            }
            const others = [...pointers.current.entries()].filter(
              ([id]) => id !== e.pointerId,
            );
            const distance = Math.hypot(
              e.clientX - old.startX,
              e.clientY - old.startY,
            );
            if (
              !gesture.current.dragged &&
              !others.length &&
              distance <= (old.type === "touch" ? 8 : 4)
            )
              return;
            gesture.current.dragged = true;
            setDragging(true);
            if (others.length) {
              gesture.current.pinched = true;
              const other = others[0][1],
                before = Math.hypot(old.x - other.x, old.y - other.y),
                after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
              const rect = e.currentTarget.getBoundingClientRect();
              if (before > 0)
                queueCamera((c) =>
                  zoomCamera(c, (c.zoom * after) / before, {
                    x: (other.x + e.clientX) / 2 - rect.left,
                    y: (other.y + e.clientY) / 2 - rect.top,
                  }),
                );
            } else
              queueCamera((c) => ({
                ...c,
                x: c.x + e.clientX - old.x,
                y: c.y + e.clientY - old.y,
              }));
            pointers.current.set(e.pointerId, {
              ...old,
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onPointerUp={(e) =>
            stopPointer(e.pointerId, false, { x: e.clientX, y: e.clientY })
          }
          onPointerCancel={(e) => stopPointer(e.pointerId, true)}
          onLostPointerCapture={(e) => stopPointer(e.pointerId, true)}
          onPointerLeave={() => {
            if (!pointers.current.size) clearHover();
          }}
          onClickCapture={(e) => {
            if (e.detail > 0 && suppressClick.current) {
              e.preventDefault();
              e.stopPropagation();
              suppressClick.current = false;
            }
          }}
        >
          <svg
            className={styles.screenLines}
            width={size.width}
            height={size.height}
            aria-hidden="true"
          >
            <path d={basePath} fill="none" stroke="#526b75" strokeWidth="1.6" />
            {recentPath && (
              <path
                d={recentPath}
                fill="none"
                stroke="#007f79"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            )}
            {lines
              .filter((l) => chain.has(l.child))
              .map((l, i) => (
                <g key={`s${i}`} data-focus-path={l.child}>
                  <line
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke="#fff"
                    strokeWidth="7.5"
                    strokeLinecap="round"
                  />
                  <line
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke="#543878"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </g>
              ))}
          </svg>
          <div
            className={styles.nodeLayer}
            data-chart-layer="v3"
            data-layer-offset={JSON.stringify(layerOffset)}
            style={{
              transform: `translate(${layerOffset.x}px, ${layerOffset.y}px)`,
            }}
          >
            {nodeElements}
          </div>
          <div className={styles.focusMarkers} aria-hidden="true">
            {hoveredNode && !dragging && (
              <div
                data-hover-node={hoveredNode.id}
                className={styles.hoverMarker}
                style={{
                  left: hoveredNode.sx - 2,
                  top: hoveredNode.sy - 2,
                  width: hoveredNode.sw + 4,
                  height: hoveredNode.sh + 4,
                }}
              />
            )}
            {showInactive &&
              projected
                .filter((n) => !n.body && !active(index.byId.get(n.id)!))
                .map((n) => (
                  <div
                    key={`inactive:${n.id}`}
                    data-inactive-marker={n.id}
                    className={styles.inactiveMarker}
                    style={{
                      left: n.sx - 3,
                      top: n.sy - 3,
                      width: n.sw + 6,
                      height: n.sh + 6,
                    }}
                  />
                ))}
            {projected
              .filter(
                (n) =>
                  !n.body &&
                  (searchMatches?.has(n.id) || personalMatches.has(n.id)),
              )
              .map((n) => (
                <div
                  key={n.id}
                  data-search-match={searchMatches?.has(n.id) || undefined}
                  data-personal-match={personalMatches.has(n.id) || undefined}
                  className={
                    searchMatches?.has(n.id)
                      ? styles.searchMarker
                      : styles.personalMarker
                  }
                  style={{
                    left: n.sx + n.sw / 2 - Math.max(12, n.sw + 6) / 2,
                    top: n.sy + n.sh / 2 - Math.max(12, n.sh + 6) / 2,
                    width: Math.max(12, n.sw + 6),
                    height: Math.max(12, n.sh + 6),
                  }}
                />
              ))}
            {projected
              .filter((n) => n.id === selected)
              .map((n) => (
                <div
                  key={n.id}
                  data-focus-marker={n.id}
                  className={styles.focusMarker}
                  style={{
                    left: n.sx + n.sw / 2 - Math.max(30, n.sw + 14) / 2,
                    top: n.sy + n.sh / 2 - Math.max(26, n.sh + 14) / 2,
                    width: Math.max(30, n.sw + 14),
                    height: Math.max(26, n.sh + 14),
                  }}
                >
                  <span>{markerLabel}</span>
                </div>
              ))}
          </div>
        </div>
        {details}
      </div>
      {colourKey}
      <div className={styles.lineLegend}>
        <span>
          {drawing.nodes.filter((n) => !n.body).length} people displayed
        </span>
        {showInactive && (
          <span>
            <i className={styles.inactiveKey} /> Dashed outline: inactive
          </span>
        )}
        <span>
          <i className={styles.reportingLine} /> Reporting
        </span>
        <span>
          <i className={styles.selectedLine} /> Selected chain
        </span>
        <span>
          <i className={styles.openedLine} /> Recently opened
        </span>
        <span>Ctrl + wheel to zoom · Shift + wheel to move sideways</span>
      </div>
    </section>
  );
}
