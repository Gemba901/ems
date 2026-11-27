"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { CalendarFilterDto, EVENT_COLORS, EVENT_COLOR_CONFIG, PartnerOrg } from "@/services/calendar.service";
import { AGENDA_KIND_FILTERS } from "./types";

export function CustomFilterForm({
  filters, activeFilterIds, orgs, isAdmin, onToggle, onCreate, onDelete, creating,
}: {
  filters: CalendarFilterDto[];
  activeFilterIds: Set<string>;
  orgs: PartnerOrg[];
  isAdmin: boolean;
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

  const kindOptions = AGENDA_KIND_FILTERS.filter(k => !("adminOnly" in k && k.adminOnly) || isAdmin);

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
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">My Filters</p>

      {filters.map(f => (
        <div key={f.id} className="flex items-center gap-2 text-sm text-muted-foreground">
          <label className="flex flex-1 cursor-pointer items-center gap-2">
            <Input
              type="checkbox"
              checked={activeFilterIds.has(f.id)}
              onChange={() => onToggle(f.id)}
              className="size-4 shrink-0 p-0 rounded accent-info"
            />
            <span className="truncate">{f.name}</span>
          </label>
          <Button variant="ghost"
            type="button"
            onClick={() => onDelete(f.id)}
            className="shrink-0 text-muted-foreground hover:text-danger"
            title="Delete filter"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      {!showForm ? (
        <Button variant="ghost"
          type="button"
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-info hover:text-info"
        >
          <Plus className="h-3.5 w-3.5" /> Add filter
        </Button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-border pt-3">
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Filter name…"
            className="w-full rounded-lg border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            maxLength={60}
          />

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Kinds</p>
            <div className="flex flex-wrap gap-1.5">
              {kindOptions.map(k => (
                <Button variant="ghost"
                  key={k.key}
                  type="button"
                  onClick={() => toggleSet(kinds, setKinds, k.key)}
                  className={`h-auto min-w-0 whitespace-normal rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    kinds.has(k.key) ? "border-info bg-info-subtle text-info" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {!isAdmin && "clientLabel" in k ? k.clientLabel : k.label}
                </Button>
              ))}
            </div>
          </div>

          {orgs.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Partners</p>
              <div className="flex flex-wrap gap-1.5">
                {orgs.map(o => (
                  <Button variant="ghost"
                    key={o.id}
                    type="button"
                    onClick={() => toggleSet(orgIds, setOrgIds, o.id)}
                    className={`h-auto min-w-0 whitespace-normal rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      orgIds.has(o.id) ? "border-info bg-info-subtle text-info" : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {o.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Colors</p>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_COLORS.map(c => (
                <Button variant="ghost"
                  key={c}
                  type="button"
                  onClick={() => toggleSet(colors, setColors, c)}
                  title={EVENT_COLOR_CONFIG[c].label}
                  className={`h-5 w-5 rounded-full ${EVENT_COLOR_CONFIG[c].dot} ${
                    colors.has(c) ? "ring-2 ring-muted-foreground ring-offset-1" : ""
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost"
              type="submit"
              disabled={creating || !name.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
            <Button variant="ghost" type="button" onClick={reset} className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
