"use client";

// Semi-circle gauge showing progress toward an implementation target.
// Fill color carries severity (critical → serious → warning → good) per the
// dataviz skill's meter spec; a status word + numeric label ensure the state
// never reads from color alone.

const STOPS: { pct: number; hex: string; label: string }[] = [
  { pct: 0,    hex: "#d03b3b", label: "Needs attention" },
  { pct: 0.33, hex: "#ec835a", label: "Getting started" },
  { pct: 0.66, hex: "#fab219", label: "On track" },
  { pct: 1,    hex: "#0ca30c", label: "Target hit" },
];

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function colorForPct(pctClamped: number) {
  let lo = STOPS[0];
  let hi = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (pctClamped >= STOPS[i].pct && pctClamped <= STOPS[i + 1].pct) {
      lo = STOPS[i];
      hi = STOPS[i + 1];
      break;
    }
  }
  const span = hi.pct - lo.pct || 1;
  const t = (pctClamped - lo.pct) / span;
  const a = hexToRgb(lo.hex);
  const b = hexToRgb(hi.hex);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bl = Math.round(lerp(a.b, b.b, t));
  const label = t < 0.5 ? lo.label : hi.label;
  return { hex: `rgb(${r}, ${g}, ${bl})`, label };
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Semi-circle arc from 0° (left) to `sweepDeg` (clockwise along the top half).
function arcPath(cx: number, cy: number, r: number, sweepDeg: number) {
  const start = polarToCartesian(cx, cy, r, 0);
  const end = polarToCartesian(cx, cy, r, sweepDeg);
  const largeArc = sweepDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export function TargetDial({
  implemented,
  target,
  title,
  size = 180,
}: {
  implemented: number;
  target: number;
  title: string;
  size?: number;
}) {
  const rawPct = target > 0 ? implemented / target : 0;
  const clamped = Math.min(1, Math.max(0, rawPct));
  const { hex, label } = colorForPct(clamped);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 14;
  const sweep = clamped * 180;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path
          d={arcPath(cx, cy, r, 180)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={14}
          strokeLinecap="round"
        />
        {clamped > 0 && (
          <path
            d={arcPath(cx, cy, r, sweep)}
            fill="none"
            stroke={hex}
            strokeWidth={14}
            strokeLinecap="round"
          />
        )}
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 26, fontWeight: 700 }}>
          {target > 0 ? `${Math.round(rawPct * 100)}%` : "—"}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11, fontWeight: 600 }}>
          {implemented} of {target} implemented
        </text>
      </svg>
      <p className="text-xs font-semibold mt-1" style={{ color: hex }}>{label}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{title}</p>
    </div>
  );
}
