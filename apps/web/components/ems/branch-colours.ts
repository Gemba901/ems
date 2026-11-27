/**
 * Shared EMS colours for branches (and, in the org chart, departments).
 * The rule comes from the v3 org chart: rank once across the whole company, by people working
 * (active + probation), then everyone, then name. The 13 largest get a palette colour; the rest are grey.
 * Filters, searches and zoom never reassign colours, so a branch keeps its colour on every page.
 * Later: a saved colour per branch id can replace the ranking without changing callers.
 */
export const PALETTE = [
  "#0072b2", "#e69f00", "#009e73", "#663399", "#f0e442", "#cc79a7", "#6b4423",
  "#56b4e9", "#a6c900", "#d55e00", "#e31a1c", "#172e54", "#607d36",
] as const;
export const OTHER_COLOUR = "#aab6bd";
export const UNRECORDED_COLOUR = "#eef2f4";

export type ColourGroup = { id: string; name: string; people: number; activePeople: number };

/** The largest PALETTE.length groups, then the rest. Groups with no id ("not recorded") are left out. */
export function rankColourGroups(groups: readonly ColourGroup[]) {
  const ranked = groups.filter(g => g.id).slice().sort((a, b) =>
    b.activePeople - a.activePeople || b.people - a.people || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { main: ranked.slice(0, PALETTE.length), others: ranked.slice(PALETTE.length) };
}

/** id → colour. `focus` (up to 13 ids, in order) replaces the ranking when the viewer picks their own. */
export function coloursForGroups(groups: readonly ColourGroup[], focus: readonly string[] = [], custom = focus.length > 0) {
  const { main, others } = rankColourGroups(groups), all = [...main, ...others];
  const chosen = custom ? [...new Set(focus)].filter(id => all.some(g => g.id === id)).slice(0, PALETTE.length) : main.map(g => g.id);
  return new Map(all.map(g => [g.id, chosen.includes(g.id) ? PALETTE[chosen.indexOf(g.id)] : OTHER_COLOUR]));
}

/** The colour for one id: grey when outside the palette, pale when not recorded. */
export const colourOf = (colours: ReadonlyMap<string, string>, id: string | null | undefined) =>
  id ? colours.get(id) ?? OTHER_COLOUR : UNRECORDED_COLOUR;
