"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService } from "@/services/sga.service";
import { HelpText, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const MAX_TEAM_MEMBERS = 5;

interface TeamSectionProps extends SgaSectionProps {
  // Department IDs picked in the Problem step but not necessarily saved yet — takes precedence
  // over the SGA's persisted departments so candidates load without a save round-trip.
  pendingDepartmentIds?: { main: string; other: string[] };
}

const TeamSection = forwardRef<SgaSectionHandle, TeamSectionProps>(function TeamSection(
  { sga, access, token, onSaved, pendingDepartmentIds },
  ref,
) {
  const [ownerId, setOwnerId] = useState(sga.ownerId ?? "");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(sga.teamMembers.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const mainDepartmentId = pendingDepartmentIds?.main ?? sga.mainDepartmentId ?? "";
  const otherDepartmentIds = pendingDepartmentIds?.other ?? sga.otherDepartments.map((d) => d.id);
  const departmentIds = [mainDepartmentId, ...otherDepartmentIds].filter(Boolean);
  const departmentKey = departmentIds.join(",");
  const { data: candidates } = useQuery({
    queryKey: ["sga-team-candidates", sga.id, departmentKey],
    queryFn: () => SgaService.getTeamCandidates(sga.id, token, departmentIds),
    enabled: !!token && editable && departmentIds.length > 0,
  });

  // The candidates endpoint only allows the raiser while still in draft, so once
  // the section is no longer editable we fall back to the SGA's own saved
  // owner/team-member records to still show correct labels in the disabled form.
  const ownerOptions = editable ? candidates ?? [] : sga.owner ? [{ ...sga.owner, jobTitle: null }] : [];
  const memberOptions = editable
    ? (candidates ?? []).filter((c) => c.id !== ownerId)
    : sga.teamMembers.map((m) => ({ ...m, jobTitle: null as string | null }));

  const toggleTeamMember = (id: string) => {
    setTeamMemberIds((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= MAX_TEAM_MEMBERS) return prev;
      return [...prev, id];
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      if (teamMemberIds.length > MAX_TEAM_MEMBERS) throw new Error(`You can select up to ${MAX_TEAM_MEMBERS} team members.`);
      return SgaService.updateTeam(
        sga.id,
        { ownerId: ownerId || undefined, teamMemberIds: teamMemberIds.length ? teamMemberIds : undefined },
        token,
      );
    },
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to save"),
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

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.1">Team</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            SGA leader <span className="text-danger">*</span>
          </label>
          <HelpText>Runs the team meetings and owns the actions. Can be you.</HelpText>
          <NativeSelect
            value={ownerId}
            disabled={!editable}
            onChange={(e) => {
              setOwnerId(e.target.value);
              setTeamMemberIds((prev) => prev.filter((id) => id !== e.target.value));
            }}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all disabled:bg-muted disabled:text-muted-foreground"
          >
            <option value="">Select a leader...</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Team Members{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional, from the departments involved · up to {MAX_TEAM_MEMBERS})
            </span>
          </label>
          {memberOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground border border-border rounded-lg px-4 py-2.5">
              {!editable
                ? "No team members selected."
                : mainDepartmentId
                ? "No other employees in the involved departments yet."
                : "Choose the main department in the Problem step first."}
            </p>
          ) : (
            <div className="border border-border rounded-lg max-h-40 overflow-y-auto divide-y divide-border">
              {memberOptions.map((c) => {
                const checked = teamMemberIds.includes(c.id);
                const disabled = !editable || (!checked && teamMemberIds.length >= MAX_TEAM_MEMBERS);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted ${
                      disabled ? "opacity-70 cursor-default" : "cursor-pointer"
                    }`}
                  >
                    <Input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleTeamMember(c.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-ring/20"
                    />
                    <span>
                      {c.firstName} {c.lastName}
                      {c.jobTitle && <span className="text-muted-foreground"> · {c.jobTitle}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default TeamSection;
