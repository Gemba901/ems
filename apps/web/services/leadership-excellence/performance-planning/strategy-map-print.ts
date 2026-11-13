import { planningPeriodLabel } from "./planning-period";
import type { StrategyMap, StrategyMapGoal } from "./strategy-map";

export type StrategyPaper = "A4" | "A3";
export const strategyPaperSize = (paper: StrategyPaper) =>
  paper === "A3" ? { width: 404, height: 281 } : { width: 281, height: 194 };

// The print document contains no scripts or external resources. All plan content
// is escaped, including names, so user input can never become executable HTML.
const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const text = (value: string | undefined, fallback = "Not set") =>
  escape(value?.trim() || fallback);
const number = (value: number | null, unit: string) =>
  value === null ? "Not set" : `${escape(value)} ${escape(unit)}`.trim();

export function strategyMapPrintHtml(
  map: StrategyMap,
  options: {
    paper: StrategyPaper;
    company: string;
    cycle: string;
    asOf: string;
    objectiveIds: string[];
    includeActions: boolean;
    includeIndividuals?: boolean;
  },
) {
  const { paper, company, cycle, asOf, objectiveIds, includeActions } = options;
  const size = strategyPaperSize(paper);
  const objectives = map.objectives.filter((o) => objectiveIds.includes(o.id));
  const goalCount = objectives.reduce((count, o) => count + o.goals.length, 0);
  const hasOwnMeasurements = objectives.some(
    (objective) => objective.measurement,
  );
  const selected = objectives.length !== map.objectives.length;
  const individualGoals =
    options.includeIndividuals === false
      ? []
      : (map.individualGoals || []).filter(
          (goal) =>
            !selected ||
            (!!goal.companyObjectiveId &&
              objectiveIds.includes(goal.companyObjectiveId)),
        );
  const individualPlans = new Map<string, typeof individualGoals>();
  for (const goal of individualGoals) {
    const key = `${goal.planId}/${goal.version}`;
    individualPlans.set(key, [...(individualPlans.get(key) || []), goal]);
  }
  const individualSheets = [...individualPlans.values()]
    .flatMap((goals) => {
      const pages: string[] = [];
      for (let start = 0; start < goals.length; start += 4) {
        const page = goals.slice(start, start + 4),
          person = page[0];
        pages.push(`<main class="strategy-sheet individual-sheet"><div class="strategy-content">
        <header class="header"><div><p class="brand">${escape(company)}</p><h1>Individual plan</h1><p>${text(person.employee)} · ${text(person.position)} · ${text(person.department)}</p><p class="meta">${text(person.planCode)} · Approved v${escape(person.version)} · As of ${escape(asOf)}</p></div><div class="year"><span class="eyebrow">PLANNING PERIOD</span><strong>${escape(planningPeriodLabel(cycle))}</strong><span class="meta">Goals ${start + 1}–${start + page.length} of ${goals.length}${selected ? " · Selected view" : ""}</span></div></header>
        <p class="individual-note">Each goal keeps its own measure and target. Individual achievement does not replace company achievement.</p>
        <table class="individual-table"><thead><tr><th>Individual goal &amp; measure</th><th>Linked approved commitment</th><th>Baseline → target / due</th></tr></thead><tbody>${page.map((goal) => `<tr><td><h3>${text(goal.title)}</h3><p class="measure">${text(goal.measure)}</p><p class="meta">${text(goal.code)}</p></td><td><p class="eyebrow">${escape(goal.parentKind === "Department" ? "Department goal" : goal.parentKind)}${goal.parentVersion === null ? "" : ` · v${escape(goal.parentVersion)}`}</p><p>${text(goal.parentTitle)}</p>${goal.parentCode ? `<p class="meta">${text(goal.parentCode)}</p>` : ""}</td><td><p>Baseline ${number(goal.baseline, goal.unit)}</p><p class="individual-target">Target ${number(goal.target, goal.unit)}</p><p class="meta">Due ${text(goal.deadline)}</p></td></tr>`).join("")}</tbody></table>
        <footer><span>Gemba PMS · Approved individual commitments</span><span>Own measures · Independent verification · No automatic roll-up</span></footer>
      </div></main>`);
      }
      return pages;
    })
    .join("");
  const spacious = paper === "A3" && objectives.length <= 2 && goalCount <= 4;
  const renderMeasure = (goal: StrategyMapGoal, ownObjective = false) => `
    <div class="goal-row ${includeActions ? "" : "goals-only"}"${ownObjective ? ` data-objective-measure="${escape(goal.id)}"` : ""}>
      <div class="goal">
        ${ownObjective ? `<p class="eyebrow">Objective measure</p>` : `<h3>${text(goal.title)}</h3>`}
        ${ownObjective && goal.result ? `<h3 class="objective-result">${text(goal.result)}</h3>` : ""}
        <p class="measure">${text(goal.measure)}</p>
        <div class="target"><span>Baseline ${number(goal.baseline, goal.unit)}</span><b>→ Target ${number(goal.target, goal.unit)}</b></div>
        ${goal.baselinePeriod ? `<p class="meta">Baseline period / sample: ${text(goal.baselinePeriod)}</p>` : ""}
        ${goal.direction ? `<p class="meta">Success: ${text(({ HIGHER: "Increase / at least the target", LOWER: "Reduce / at most the target", MAINTAIN_MIN: "Maintain at least this level" } as Record<string, string>)[goal.direction] || goal.direction)}</p>` : ""}
        ${goal.definition ? `<p class="meta">Counting rule: ${text(goal.definition)}</p>` : ""}
        ${goal.dataSource ? `<p class="meta">Source / verifier: ${text(goal.dataSource)}</p>` : ""}
        ${goal.reviewFrequency ? `<p class="meta">Review: ${text(goal.reviewFrequency)}</p>` : ""}
        ${goal.guardrails ? `<p class="meta">Quality / safety: ${text(goal.guardrails)}</p>` : ""}
        <div class="meta">${ownObjective ? "" : `${text(goal.code)} · ${text(goal.owner)} · `}Due ${text(goal.deadline)}</div>
        ${goal.departments.length ? `<p class="meta">Contributors: ${goal.departments.map(escape).join(", ")}</p>` : ""}
      </div>
      ${
        includeActions
          ? `<div class="actions">
        ${ownObjective && goal.contributions?.length ? goal.contributions.map((contribution) => `<div class="department-contribution"><p class="eyebrow">${text(contribution.department)} · Department goal</p><h3>${text(contribution.title)}</h3><p class="measure">${text(contribution.measure)}</p><p class="meta">Baseline ${number(contribution.baseline, contribution.unit)} → Target ${number(contribution.target, contribution.unit)}</p><p class="meta">${text(contribution.code)} · Approved v${escape(contribution.version)} · Due ${text(contribution.deadline)}</p></div>`).join("") : ""}
        ${goal.actions.length ? goal.actions.map((action) => `<div class="action"><h3>${text(action.title)}</h3><p class="meta">${text(action.department)} · ${text(action.owner)} · Due ${text(action.dueDate)}</p></div>`).join("") : ownObjective && goal.contributions?.length ? "" : `<p class="empty">No linked approved ${ownObjective ? "department goals or actions" : "actions"} available.</p>`}
      </div>`
          : ""
      }
    </div>`;
  const rows = objectives
    .map(
      (objective) => `
    <section class="objective-row">
      <div class="objective">
        <div class="eyebrow">${text(objective.pillar)} · ${text(objective.pillarName)}</div>
        <h2>${text(objective.title)}</h2>
        ${objective.meaning ? `<p>${text(objective.meaning)}</p>` : ""}
        <div class="meta">${text(objective.code)} · ${text(objective.owner)}</div>
        <p class="meta">Priority: <strong>${objective.priority == null ? "Not set" : escape(objective.priority)}</strong></p>
        <p class="meta">Weightage: <strong>${objective.weightage == null ? "Not assigned" : `${escape(objective.weightage)}%`}</strong></p>
        ${objective.alignments.length ? `<div class="tags">${objective.alignments.map((tag) => `<span>${escape(tag)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="commitments">
        ${
          objective.measurement
            ? renderMeasure(objective.measurement, true)
            : objective.goals.length
              ? objective.goals.map((goal) => renderMeasure(goal)).join("")
              : `<p class="empty">No linked company goals in this historical version.</p>`
        }
      </div>
    </section>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escape(company)} — Strategy map ${escape(planningPeriodLabel(cycle))}</title>
  <style>
    @page { size: ${paper} landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #172b4d; background: white; }
    body { overflow: hidden; }
    .strategy-sheet { width: ${size.width}mm; height: ${size.height}mm; padding: 5mm; background: white; overflow: hidden; break-after: page; }
    .strategy-sheet:last-child { break-after: auto; }
    .strategy-content { transform: scale(var(--content-scale, 1)); transform-origin: top center; font-size: ${spacious ? 14 : 11}pt; line-height: 1.4; overflow-wrap: anywhere; }
    h1,h2,h3,p { margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: start; gap: 24px; border-bottom: 3px solid #52618a; padding-bottom: 14px; }
    .brand { color: #52618a; font-weight: bold; font-size: 11pt; letter-spacing: .04em; }
    h1 { font-size: 25pt; line-height: 1.1; margin: 5px 0; }
    .year { text-align: right; flex: 0 0 auto; }
    .year strong { display: block; max-width: 250px; font-size: 14pt; line-height: 1.4; }
    .meta { font-size: 9pt; color: #526178; line-height: 1.5; margin-top: 6px; }
    .direction { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; padding: 15px 0; }
    .direction > div { border: 1px solid #dce3ef; border-radius: 7px; padding: 12px; background: #f7f9fd; }
    .eyebrow { font-size: 9pt; color: #52618a; font-weight: bold; letter-spacing: .04em; margin-bottom: 6px; }
    .purpose { font-size: 10pt; margin: 0 0 12px; }
    .flow { display: grid; grid-template-columns: 27% ${includeActions ? "36.5% 36.5%" : "73%"}; color: white; background: #52618a; border: 1px solid #52618a; border-radius: 6px 6px 0 0; }
    .flow span { padding: 9px 12px; font-weight: bold; font-size: 10pt; }
    .objective-row { display: grid; grid-template-columns: 27% 73%; border: 1px solid #dce3ef; border-top: 0; break-inside: avoid; }
    .objective { padding: 14px 12px; background: #f7f9fd; border-right: 1px solid #dce3ef; }
    h2 { font-size: 13pt; line-height: 1.3; margin-bottom: 7px; }
    h3 { font-size: 11pt; line-height: 1.35; margin-bottom: 4px; }
    .objective p { font-size: 10pt; }
    .goal-row { display: grid; grid-template-columns: 1fr 1fr; }
    .goal-row + .goal-row { border-top: 1px solid #dce3ef; }
    .goals-only { grid-template-columns: 1fr; }
    .goal,.actions { padding: 14px 12px; }
    .actions { border-left: 1px solid #dce3ef; }
    .action + .action { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dce3ef; }
    .department-contribution { padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid #dce3ef; }
    .measure { font-size: 10pt; color: #526178; }
    .target { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 8px 0; font-size: 11pt; }
    .target b { color: #174e49; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .tags span { border: 1px solid #dce3ef; background: white; border-radius: 4px; padding: 2px 5px; font-size: 9pt; }
    .empty { font-size: 10pt; color: #6b7280; }
    .individual-note { margin: 16px 0; font-size: 10pt; color: #526178; }
    .individual-table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 10pt; }
    .individual-table th { text-align: left; background: #52618a; color: white; padding: 10px 12px; font-size: 10pt; }
    .individual-table th:first-child { width: 38%; }
    .individual-table th:nth-child(2) { width: 36%; }
    .individual-table td { border: 1px solid #dce3ef; padding: 14px 12px; vertical-align: top; }
    .individual-table tr { break-inside: avoid; }
    .individual-target { margin-top: 8px; color: #174e49; font-weight: bold; }
    ${spacious ? ".direction > div {padding: 18px;} .objective,.goal,.actions {padding: 20px 16px;} h2 {font-size: 16pt;} h3,.target {font-size: 14pt;} .objective p,.measure {font-size: 12pt;} .meta,.eyebrow,.tags span {font-size: 10pt;}" : ""}
    footer { margin-top: 14px; border-top: 1px solid #dce3ef; padding-top: 8px; display: flex; justify-content: space-between; gap: 20px; font-size: 9pt; color: #526178; }
    @media screen { .print-stack { transform: scale(var(--preview-scale, 1)); transform-origin: top left; } }
    @media print { html,body { width: ${size.width}mm; height: auto; overflow: visible; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body><div class="print-stack"><main class="strategy-sheet"><div class="strategy-content">
    <header class="header"><div><p class="brand">${escape(company)}</p><h1>Strategy on one page</h1><p>${text(map.plan?.title)}</p><p class="meta">${text(map.plan?.code)} · Approved v${escape(map.plan?.version)} · Effective ${text(map.plan?.effectiveDate)} · As of ${escape(asOf)}</p></div><div class="year"><span class="eyebrow">PLANNING PERIOD</span><strong>${escape(planningPeriodLabel(cycle))}</strong><span class="meta">${objectives.length} objectives${goalCount ? ` · ${goalCount} goals` : ""}${selected ? " · Selected view" : ""}</span></div></header>
    <section class="direction" aria-label="Company direction">
      <div><h2 class="eyebrow">MISSION · WHY WE EXIST</h2><p>${text(map.direction.mission, "Not yet published by Strategic Direction")}</p></div>
      <div><h2 class="eyebrow">VISION · WHERE WE ARE GOING</h2><p>${text(map.direction.vision, "Not yet published by Strategic Direction")}</p></div>
      <div><h2 class="eyebrow">VALUES · HOW WE WORK</h2><p>${map.direction.values.length ? map.direction.values.map(escape).join(" · ") : "No approved values available"}</p></div>
    </section>
    ${map.direction.purpose ? `<p class="purpose"><strong>Purpose:</strong> ${escape(map.direction.purpose)}</p>` : ""}
    <div class="flow"><span>COMPANY OBJECTIVES</span><span>${hasOwnMeasurements ? "MEASURE &amp; TARGET" : "MEASURABLE GOALS"}</span>${includeActions ? `<span>${hasOwnMeasurements ? "DEPARTMENT GOALS &amp; ACTIONS" : "KEY IMPROVEMENT ACTIONS"}</span>` : ""}</div>
    ${rows}
    <footer><span>Gemba PMS · Leadership Excellence${map.direction.version !== null ? ` · Latest approved direction v${escape(map.direction.version)}` : ""}</span><span>Approved commitments · Achievement uses independently verified company measures.${includeActions ? " Only available approved department links to this company version are included." : ""}</span></footer>
  </div></main>${individualSheets}</div></body></html>`;
}
