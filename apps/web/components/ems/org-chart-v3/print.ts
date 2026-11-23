import {
  CARD,
  ISSUE,
  active,
  BODY,
  branchName,
  human,
  personColour,
  type Drawing,
  type Index,
  type Node,
} from "./model";
export type PrintMode = "pages" | "overview";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const PAGE = {
  width: 1300,
  height: 810,
  overlapX: CARD.width + 20,
  overlapY: CARD.height + 20,
};
export function printTiles(d: Drawing, mode: PrintMode) {
  if (mode === "overview")
    return [
      {
        x: -12,
        y: -12,
        width: d.width + 24,
        height: d.height + 24,
        row: 1,
        column: 1,
      },
    ];
  const tiles: {
    x: number;
    y: number;
    width: number;
    height: number;
    row: number;
    column: number;
  }[] = [];
  const cols = Math.max(
    1,
    Math.ceil((d.width + 24 - PAGE.overlapX) / (PAGE.width - PAGE.overlapX)),
  );
  const rows = Math.max(
    1,
    Math.ceil((d.height + 24 - PAGE.overlapY) / (PAGE.height - PAGE.overlapY)),
  );
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      tiles.push({
        x: c * (PAGE.width - PAGE.overlapX) - 12,
        y: r * (PAGE.height - PAGE.overlapY) - 12,
        width: PAGE.width,
        height: PAGE.height,
        row: r + 1,
        column: c + 1,
      });
  // Empty sheets in sparse horizontal trees add no information.
  return tiles.filter((t) => d.nodes.some((n) => inside(n, t)));
}
export const inside = (
  n: Node,
  t: { x: number; y: number; width: number; height: number },
) =>
  n.x >= t.x &&
  n.y >= t.y &&
  n.x + n.width <= t.x + t.width &&
  n.y + n.height <= t.y + t.height;
function wrap(s: string, limit: number, rows: number) {
  const result: string[] = [];
  let current = "";
  for (const word of s.split(/\s+/)) {
    if (current && (current + " " + word).length > limit) {
      result.push(current);
      current = "";
    }
    // Break unbroken names rather than letting them overflow the card.
    const pieces = word.match(new RegExp(`.{1,${limit}}`, "gu")) || [];
    for (const part of pieces) {
      if (current && (current + " " + part).length > limit) {
        result.push(current);
        current = "";
      }
      current += (current ? " " : "") + part;
    }
  }
  if (current) result.push(current);
  if (result.length > rows)
    return [
      ...result.slice(0, rows - 1),
      result[rows - 1].slice(0, limit - 1) + "…",
    ];
  return result;
}
export function printDocument(
  drawing: Drawing,
  index: Index,
  colours: Map<string, string>,
  mode: PrintMode,
  title: string,
  subtitle: string,
  timestamp: string,
  colourBy: "department" | "branch" = "department",
) {
  const tiles = printTiles(drawing, mode);
  const txt = (s: string) => escapeHtml(s);
  const renderNode = (n: Node) => {
    const p = index.byId.get(n.id),
      colour = p ? personColour(p, colours, colourBy) : "#675188";
    const name = n.body || p!.name;
    const issues = p
      ? (index.issues.get(p.id) || []).map((k) => ISSUE[k] || k)
      : [];
    const badge = issues.length ? "!" : p && !active(p) ? "Inactive" : "";
    let svg = `<g><title>${txt(name)}</title><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="10" fill="white" stroke="${colour}" stroke-width="2.5"/><rect x="${n.x}" y="${n.y + 8}" width="6" height="${n.height - 16}" fill="${colour}"/>`;
    const texts = wrap(name, badge ? 22 : 28, n.body ? 2 : 3);
    if (badge)
      svg += `<text x="${n.x + n.width - 12}" y="${n.y + 23}" text-anchor="end" font-size="12" fill="#805421">${txt(badge)}</text>`;
    texts.forEach((line, i) => {
      svg += `<text x="${n.x + 14}" y="${n.y + 23 + i * 19}" font-size="16" font-weight="700">${txt(line)}</text>`;
    });
    if (p) {
      const detail = [
        `${!active(p) ? "Inactive · " : ""}${p.jobTitle || "Job title not recorded"}`,
        p.department?.name || "Department not recorded",
        branchName(p),
      ].filter(Boolean);
      detail.forEach((line, i) => {
        svg += `<text x="${n.x + 14}" y="${n.y + 91 + i * 17}" font-size="14">${txt(wrap(line, 30, 1)[0] || "")}</text>`;
      });
    }
    return svg + "</g>";
  };
  const sheets = tiles
    .map((t, i) => {
      const lines = drawing.lines.filter(
        (l) =>
          Math.max(l.x1, l.x2) >= t.x &&
          Math.min(l.x1, l.x2) <= t.x + t.width &&
          Math.max(l.y1, l.y2) >= t.y &&
          Math.min(l.y1, l.y2) <= t.y + t.height,
      );
      return `<section class="sheet"><header><strong>${txt(title)}</strong><span>${txt(subtitle)}</span><small>${txt(timestamp)} · Page ${i + 1} of ${tiles.length}${mode === "pages" ? ` · row ${t.row}, column ${t.column}` : " · overview"}</small></header><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Organisation chart" viewBox="${t.x} ${t.y} ${t.width} ${t.height}"><g stroke="#526b75" stroke-width="2.8">${lines.map((l) => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}"/>`).join("")}</g>${drawing.nodes
        .filter((n) => inside(n, t))
        .map(renderNode)
        .join(
          "",
        )}</svg><footer>${mode === "pages" ? "Neighbouring pages overlap so cards stay whole. Continue using the row and column numbers. ! = reporting needs review." : "Overview of the selected chart view. ! = reporting needs review."}</footer></section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${txt(title)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#182f3f;font:14px Arial,sans-serif}.tools{padding:16px;background:white;position:sticky;top:0;display:flex;gap:16px;align-items:center}.tools button{font:inherit;padding:9px 16px;border:1px solid #76658d;border-radius:8px;background:#f5f1fb;cursor:pointer}.sheet{width:277mm;height:188mm;padding:3mm;margin:12px auto;background:white;break-after:page;overflow:hidden}.sheet:last-child{break-after:auto}header{height:18mm;display:flex;flex-direction:column;gap:3px}header strong{font-size:18px}header small,footer{color:#526571;font-size:11px}svg{display:block;width:100%;height:158mm;font-family:Arial,sans-serif;fill:#182f3f}footer{height:6mm;padding-top:2mm}@media print{body{background:white}.tools{display:none}.sheet{margin:0;padding:0;width:277mm;height:188mm;box-shadow:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="tools"><button id="print-chart">Print / Save as PDF</button><span>${tiles.length} page${tiles.length === 1 ? "" : "s"} · use landscape orientation</span></div>${sheets}</body></html>`;
}

export function printOutlineDocument(
  rows: { id: string; depth: number }[],
  index: Index,
  title: string,
  subtitle: string,
  timestamp: string,
) {
  const e = escapeHtml;
  const body = rows
    .map(({ id, depth }) => {
      const p = index.byId.get(id)!,
        manager = index.parent.get(id);
      const issues = (index.issues.get(id) || []).map((k) => ISSUE[k] || k);
      const reporting = manager
        ? index.byId.get(manager)!.name
        : p.managerId
          ? "Needs review"
          : BODY[p.reportsToBody || ""] || "Not confirmed";
      return `<tr><td style="padding-left:${8 + Math.min(depth, 10) * 14}px"><strong>${e(p.name)}</strong><small>${e(p.jobTitle || "Job title not recorded")}</small></td><td>${e(p.department?.name || "Not recorded")}<small>${e(branchName(p))}</small></td><td>${e(reporting)}</td><td>${e(p.status ? human(p.status) : "Current employee")}${issues.length ? `<small>${e(issues.join(" · "))}</small>` : ""}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#203747;margin:24px}h1{font-size:20px;margin:0 0 6px}p{margin:6px 0 12px;color:#526571}.tools{margin-bottom:18px}.tools button{font:inherit;padding:9px 16px}table{border-collapse:collapse;width:100%}th{text-align:left;background:#edf4f4;padding:9px;border-bottom:2px solid #8eacab}td{padding:8px;border-bottom:1px solid #dbe4e7;vertical-align:top}small{display:block;margin-top:3px;color:#526571}thead{display:table-header-group}tr{break-inside:avoid}@media print{body{margin:0}.tools{display:none}}</style></head><body><div class="tools"><button id="print-chart">Print / Save as PDF</button></div><h1>${e(title)}</h1><p>${e(subtitle)} · ${rows.length} people · ${e(timestamp)}</p><table><thead><tr><th>Person / role</th><th>Department / branch</th><th>Reports to</th><th>Status</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
}
