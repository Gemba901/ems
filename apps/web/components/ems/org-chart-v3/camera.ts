import { fitZoom, type Drawing, type Line } from "./model";

/** The camera is in viewport pixels. The drawing never becomes a giant DOM surface. */
export type Camera = { zoom: number; x: number; y: number };
export type Viewport = { width: number; height: number };
export const clampZoom = (zoom: number) => Math.max(0.0001, Math.min(2, zoom));
/** Bound panning while allowing even an edge person to be centred for reading. */
export function limitCamera(c: Camera, d: Drawing, size: Viewport): Camera {
  if (!d.nodes.length) return c;
  const zoom = clampZoom(c.zoom);
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity,
    firstX = Infinity,
    firstY = Infinity,
    lastX = -Infinity,
    lastY = -Infinity;
  for (const n of d.nodes) {
    left = Math.min(left, n.x);
    top = Math.min(top, n.y);
    right = Math.max(right, n.x + n.width);
    bottom = Math.max(bottom, n.y + n.height);
    firstX = Math.min(firstX, n.x + n.width / 2);
    lastX = Math.max(lastX, n.x + n.width / 2);
    firstY = Math.min(firstY, n.y + n.height / 2);
    lastY = Math.max(lastY, n.y + n.height / 2);
  }
  const limit = (
    offset: number,
    start: number,
    end: number,
    span: number,
    first: number,
    last: number,
  ) => {
    const margin = Math.min(32, span / 4);
    const a = margin - start * zoom,
      b = span - margin - end * zoom;
    return Math.max(
      Math.min(a, b, span / 2 - last * zoom),
      Math.min(Math.max(a, b, span / 2 - first * zoom), offset),
    );
  };
  const x = limit(c.x, left, right, size.width, firstX, lastX),
    y = limit(c.y, top, bottom, size.height, firstY, lastY);
  return x === c.x && y === c.y && zoom === c.zoom ? c : { zoom, x, y };
}
/** Finish a gesture with a useful part of a person visible, without changing zoom or opened teams. */
export function settleCamera(c: Camera, d: Drawing, size: Viewport): Camera {
  const limited = limitCamera(c, d, size);
  const inset = Math.min(24, size.width / 8, size.height / 8);
  let best = limited,
    distance = Infinity;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
  for (const n of d.nodes) {
    if (n.body) continue;
    const w = Math.min(
      n.width * limited.zoom,
      64,
      (size.width - inset * 2) / 2,
    );
    const h = Math.min(
      n.height * limited.zoom,
      48,
      (size.height - inset * 2) / 2,
    );
    const x = clamp(
      limited.x,
      inset + w - (n.x + n.width) * limited.zoom,
      size.width - inset - w - n.x * limited.zoom,
    );
    const y = clamp(
      limited.y,
      inset + h - (n.y + n.height) * limited.zoom,
      size.height - inset - h - n.y * limited.zoom,
    );
    const delta = (x - limited.x) ** 2 + (y - limited.y) ** 2;
    if (!delta) return limited;
    if (delta < distance) {
      distance = delta;
      best = { ...limited, x, y };
    }
  }
  return limitCamera(best, d, size);
}
export function fitCamera(d: Drawing, size: Viewport): Camera {
  const zoom = fitZoom(d, size.width, size.height);
  return {
    zoom,
    x: (size.width - d.width * zoom) / 2,
    y: (size.height - d.height * zoom) / 2,
  };
}
/** Phones fit the entire Overview; desktop retains its readable minimum scale. */
export function overviewCamera(
  d: Drawing,
  size: Viewport,
  fitWhole = false,
): Camera {
  const fit = fitCamera(d, size);
  if (fitWhole || fit.zoom >= 0.55) return fit;
  return {
    zoom: 0.55,
    x: (size.width - d.width * 0.55) / 2,
    y: 24,
  };
}
export function centreCamera(
  d: Drawing,
  size: Viewport,
  previous: Camera,
  id?: string,
  readable = false,
): Camera {
  const node =
    d.nodes.find((n) => n.id === id) ||
    d.nodes.find((n) => !n.body) ||
    d.nodes[0];
  const zoom = readable
    ? Math.max(0.8, Math.min(1, fitZoom(d, size.width, size.height)))
    : clampZoom(previous.zoom);
  if (!node) return fitCamera(d, size);
  return {
    zoom,
    x: size.width / 2 - (node.x + node.width / 2) * zoom,
    y:
      (readable ? Math.min(size.height / 2, 130) : size.height / 2) -
      (node.y + node.height / 2) * zoom,
  };
}
export function zoomCamera(
  c: Camera,
  zoom: number,
  point: { x: number; y: number },
): Camera {
  const z = clampZoom(zoom),
    ratio = z / c.zoom;
  return {
    zoom: z,
    x: point.x - (point.x - c.x) * ratio,
    y: point.y - (point.y - c.y) * ratio,
  };
}
/** Step zoom centres the selected person; pointer zoom remains anchored at the pointer. */
export function zoomSelectedCamera(
  d: Drawing,
  size: Viewport,
  c: Camera,
  zoom: number,
  id?: string,
): Camera {
  return id && d.nodes.some((n) => n.id === id)
    ? centreCamera(d, size, { ...c, zoom }, id)
    : zoomCamera(c, zoom, { x: size.width / 2, y: size.height / 2 });
}
/** Reveal a selected person with the smallest pan; never change the user's zoom. */
export function spotCamera(
  d: Drawing,
  size: Viewport,
  c: Camera,
  id?: string,
): Camera {
  const n = d.nodes.find((n) => n.id === id);
  if (!n) return c;
  const adjust = (start: number, span: number, available: number) => {
    const margin = 36;
    if (span > available - margin * 2)
      return available / 2 - (start + span / 2);
    if (start < margin) return margin - start;
    if (start + span > available - margin)
      return available - margin - start - span;
    return 0;
  };
  return {
    ...c,
    x: c.x + adjust(n.x * c.zoom + c.x, n.width * c.zoom, size.width),
    y: c.y + adjust(n.y * c.zoom + c.y, n.height * c.zoom, size.height),
  };
}
export function anchorCamera(
  c: Camera,
  before: Drawing,
  after: Drawing,
  id: string,
): Camera {
  const a = before.nodes.find((n) => n.id === id),
    b = after.nodes.find((n) => n.id === id);
  return a && b
    ? {
        ...c,
        x: c.x + (a.x + a.width / 2 - b.x - b.width / 2) * c.zoom,
        y: c.y + (a.y - b.y) * c.zoom,
      }
    : c;
}
/** Clip lines to the viewport before giving them to SVG; no huge texture/scroll bounds. */
export function screenLine(l: Line, c: Camera, size: Viewport): Line | null {
  let x1 = l.x1 * c.zoom + c.x,
    y1 = l.y1 * c.zoom + c.y,
    x2 = l.x2 * c.zoom + c.x,
    y2 = l.y2 * c.zoom + c.y;
  const dx = x2 - x1,
    dy = y2 - y1;
  let low = 0,
    high = 1;
  const p = [-dx, dx, -dy, dy],
    q = [x1, size.width - x1, y1, size.height - y1];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return null;
      continue;
    }
    const r = q[k] / p[k];
    if (p[k] < 0) low = Math.max(low, r);
    else high = Math.min(high, r);
    if (low > high) return null;
  }
  return {
    ...l,
    x1: x1 + low * dx,
    y1: y1 + low * dy,
    x2: x1 + high * dx,
    y2: y1 + high * dy,
  };
}

/** Prefer the actual tile. For near misses use the nearest rectangle within a small
 * screen-pixel tolerance; equal-distance neighbours are deliberately left unselected. */
export function hitTestPerson(
  d: Drawing,
  c: Camera,
  point: { x: number; y: number },
  tolerance = 5,
  size?: Viewport,
): string | undefined {
  if (
    size &&
    (point.x < 0 ||
      point.y < 0 ||
      point.x > size.width ||
      point.y > size.height)
  )
    return undefined;
  let best: string | undefined,
    distance = Infinity,
    tied = false;
  for (const n of d.nodes) {
    if (n.body) continue;
    const left = n.x * c.zoom + c.x,
      top = n.y * c.zoom + c.y;
    if (
      size &&
      (left + n.width * c.zoom <= 0 ||
        top + n.height * c.zoom <= 0 ||
        left >= size.width ||
        top >= size.height)
    )
      continue;
    const dx = Math.max(left - point.x, 0, point.x - left - n.width * c.zoom);
    const dy = Math.max(top - point.y, 0, point.y - top - n.height * c.zoom);
    const squared = dx * dx + dy * dy;
    if (squared > tolerance * tolerance) continue;
    if (squared < distance - 0.0001) {
      best = n.id;
      distance = squared;
      tied = false;
    } else if (Math.abs(squared - distance) <= 0.0001) tied = true;
  }
  return tied ? undefined : best;
}
