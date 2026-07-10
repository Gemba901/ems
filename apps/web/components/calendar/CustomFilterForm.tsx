"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { CalendarFilterDto, EVENT_COLORS, EVENT_COLOR_CONFIG, PartnerOrg } from "@/services/calendar.service";
import { AGENDA_KIND_FILTERS } from "./types";

export function CustomFilterForm({
  filters, activeFilterIds, orgs, onToggle, onCreate, onDelete, creating,
}: {
  filters: CalendarFilterDto[];
  activeFilterIds: Set<string>;
  orgs: PartnerOrg[];
  onToggle: (id: string) => void;
  onCreate: (data: { name: string; kinds?: string[]; orgIds?: string[]; colors?: string[] }) => void;
  onDelete: (id: string) => void;
  creating: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kinds, setKinds] = useState<Set<string>>(new Set());
  const [orgIds, setOrgIds] = useState<Set<string>>(new Set());
  const [colors, setColors] = useState<Set<string>>(new Set());

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const reset = () => {
    setName(""); setKinds(new Set()); setOrgIds(new Set()); setColors(new Set()); setShowForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      kinds: kinds.size ? Array.from(kinds) : undefined,
      orgIds: orgIds.size ? Array.from(orgIds) : undefined,
      colors: colors.size ? Array.from(colors) : undefined,
    });
    reset();
  };

  return (
    <div className="space-y-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">My Filters</p>

      {filters.map(f => (
        <div key={f.id} className="flex items-center gap-2 text-sm text-slate-600">
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={activeFilterIds.has(f.id)}
              onChange={() => onToggle(f.id)}
              className="rounded accent-blue-600"
            />
            <span className="truncate">{f.name}</span>
          </label>
          <button
            type="button"
            onClick={() => onDelete(f.id)}
            className="shrink-0 text-slate-300 hover:text-red-500"
            title="Delete filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add filter
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-slate-100 pt-3">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Filter name…"
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
            maxLength={60}
          />

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Kinds</p>
            <div className="flex flex-wrap gap-1.5">
              {AGENDA_KIND_FILTERS.map(k => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => toggleSet(kinds, setKinds, k.key)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    kinds.has(k.key) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {orgs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Partners</p>
              <div className="flex flex-wrap gap-1.5">
                {orgs.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleSet(orgIds, setOrgIds, o.id)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      orgIds.has(o.id) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Colors</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleSet(colors, setColors, c)}
                  title={EVENT_COLOR_CONFIG[c].label}
                  className={`h-5 w-5 rounded-full ${EVENT_COLOR_CONFIG[c].dot} ${
                    colors.has(c) ? "ring-2 ring-slate-400 ring-offset-1" : ""
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </button>
            <button type="button" onClick={reset} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
