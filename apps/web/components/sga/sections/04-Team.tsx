"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService } from "@/services/sga.service";
import { SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const MAX_TEAM_MEMBERS = 5;

const TeamSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function TeamSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [ownerId, setOwnerId] = useState(sga.ownerId ?? "");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(sga.teamMembers.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);

  const { data: candidates } = useQuery({
    queryKey: ["sga-team-candidates", sga.id],
    queryFn: () => SgaService.getTeamCandidates(sga.id, token),
    enabled: !!token && access.editable,
  });

  const ownerOptions = candidates ?? [];
  const memberOptions = (candidates ?? []).filter((c) => c.id !== ownerId);

  const toggleTeamMember = (id: string) => {
    setTeamMemberIds((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= MAX_TEAM_MEMBERS) return prev;
      return [...prev, id];
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (!ownerId) throw new Error("Please select an SGA owner.");
      if (teamMemberIds.length > MAX_TEAM_MEMBERS) throw new Error(`You can select up to ${MAX_TEAM_MEMBERS} team members.`);
      return SgaService.updateTeam(
        sga.id,
        { ownerId, teamMemberIds: teamMemberIds.length ? teamMemberIds : undefined },
        token,
      );
    },
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to save"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
  }));

  if (!access.editable) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
        <SectionLabel n="2.1">Team</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">SGA Owner</p>
            <p className="text-sm text-slate-700">
              {sga.owner ? `${sga.owner.firstName} ${sga.owner.lastName}` : "Not set"}
            </p>
          </div>
          {sga.teamMembers.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Team Members</p>
              <p className="text-sm text-slate-700">{sga.teamMembers.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.1">Team</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            SGA Owner <span className="text-red-500">*</span>
          </label>
          <select
            value={ownerId}
            onChange={(e) => {
              setOwnerId(e.target.value);
              setTeamMemberIds((prev) => prev.filter((id) => id !== e.target.value));
            }}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select an owner...</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Team Members{" "}
            <span className="text-xs font-normal text-slate-400">
              (optional, from the departments involved · up to {MAX_TEAM_MEMBERS})
            </span>
          </label>
          {memberOptions.length === 0 ? (
            <p className="text-xs text-slate-400 border border-slate-200 rounded-lg px-4 py-2.5">
              {sga.mainDepartmentId
                ? "No other employees in the involved departments yet."
                : "Select a main department in Step 1.2 first."}
            </p>
          ) : (
            <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
              {memberOptions.map((c) => {
                const checked = teamMemberIds.includes(c.id);
                const disabled = !checked && teamMemberIds.length >= MAX_TEAM_MEMBERS;
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 ${
                      disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleTeamMember(c.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
                    />
                    <span>
                      {c.firstName} {c.lastName}
                      {c.jobTitle && <span className="text-slate-400"> · {c.jobTitle}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default TeamSection;
