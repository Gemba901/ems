"use client";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { KaizenService } from "@/services/kaizen.service";
import { formatDate, HelpText, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { KaizenSectionHandle, KaizenSectionProps } from "./types";

const MAX_DURATION_DAYS = 30;
const MAX_TEAM_MEMBERS = 3;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function durationDays(startIso: string, targetIso: string) {
  const start = new Date(startIso);
  const target = new Date(targetIso);
  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

const BasicInfoSection = forwardRef<KaizenSectionHandle, KaizenSectionProps>(function BasicInfoSection(
  { kaizen, access, token, onSaved },
  ref,
) {
  const [startDate, setStartDate] = useState(toIsoDateInput(kaizen.startDate) || todayIsoDate());
  const [targetCompletionDate, setTargetCompletionDate] = useState(toIsoDateInput(kaizen.targetCompletionDate));
  const [kaizenOwnerId, setKaizenOwnerId] = useState(kaizen.kaizenOwnerId ?? "");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(kaizen.teamMembers.map((m) => m.id));
  const [error, setError] = useState<string | null>(null);

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(token),
    enabled: !!token && access.editable,
  });
  const { data: colleagues } = useQuery({
    queryKey: ["employee-colleagues"],
    queryFn: () => EmployeeService.getMyColleagues(token),
    enabled: !!token && access.editable && !!me?.departmentId,
  });

  const ownerOptions = me ? [{ id: me.id, firstName: me.firstName, lastName: me.lastName }, ...(colleagues ?? [])] : (colleagues ?? []);

  const maxTargetDate = startDate ? addDays(startDate, MAX_DURATION_DAYS) : undefined;
  const duration = startDate && targetCompletionDate ? durationDays(startDate, targetCompletionDate) : null;

  const toggleTeamMember = (id: string) => {
    setTeamMemberIds((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= MAX_TEAM_MEMBERS) return prev;
      return [...prev, id];
    });
  };

  const mutation = useMutation({
    mutationFn: () => {
      // Drafts may be saved half-filled; submit checks what is still missing.
      if (duration !== null && (duration < 0 || duration > MAX_DURATION_DAYS)) {
        throw new Error(`Target completion date must be within ${MAX_DURATION_DAYS} days of the start date.`);
      }
      if (!kaizenOwnerId) throw new Error("Please select a kaizen owner.");
      if (teamMemberIds.length > MAX_TEAM_MEMBERS) throw new Error(`You can select up to ${MAX_TEAM_MEMBERS} team members.`);
      return KaizenService.updateBasicInfo(
        kaizen.id,
        {
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          targetCompletionDate: targetCompletionDate ? new Date(targetCompletionDate).toISOString() : undefined,
          kaizenOwnerId: kaizenOwnerId || undefined,
          teamMemberIds: teamMemberIds.length ? teamMemberIds : undefined,
        },
        token,
      );
    },
    onSuccess: (updated) => onSaved(updated),
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

  if (!access.editable) {
    return (
      <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
        <SectionLabel n="1.4">Basic Daily Kaizen Information</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Title</p>
            <p className="text-sm text-foreground">{kaizen.title || "Untitled"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Kaizen Owner</p>
            <p className="text-sm text-foreground">
              {kaizen.kaizenOwner ? `${kaizen.kaizenOwner.firstName} ${kaizen.kaizenOwner.lastName}` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Start Date</p>
            <p className="text-sm text-foreground">{kaizen.startDate ? formatDate(kaizen.startDate) : "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Target Completion</p>
            <p className="text-sm text-foreground">{kaizen.targetCompletionDate ? formatDate(kaizen.targetCompletionDate) : "Not set"}</p>
          </div>
          {kaizen.startDate && kaizen.targetCompletionDate && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
              <p className="text-sm text-foreground">
                {durationDays(toIsoDateInput(kaizen.startDate), toIsoDateInput(kaizen.targetCompletionDate))} days
              </p>
            </div>
          )}
          {kaizen.teamMembers.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Team Members</p>
              <p className="text-sm text-foreground">{kaizen.teamMembers.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.4">Owner &amp; dates</SectionLabel>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              Start date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">
              Finish by
            </label>
            <Input
              type="date"
              value={targetCompletionDate}
              min={startDate}
              max={maxTargetDate}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">A daily kaizen should be finished within {MAX_DURATION_DAYS} days.</p>
        {duration !== null && (
          <div>
            <label className="text-sm font-semibold text-foreground block mb-1.5">Duration</label>
            <p
              className={`text-sm rounded-lg px-4 py-2.5 border ${
                duration < 0 || duration > MAX_DURATION_DAYS
                  ? "border-danger/25 bg-danger-subtle text-danger"
                  : "border-border bg-muted text-foreground"
              }`}
            >
              {duration} day{duration === 1 ? "" : "s"}
            </p>
          </div>
        )}
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Kaizen owner
          </label>
          <HelpText>The person who does the work and reports the result. Usually you.</HelpText>
          <NativeSelect
            value={kaizenOwnerId}
            onChange={(e) => setKaizenOwnerId(e.target.value)}
            className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-all"
          >
            <option value="">Select an owner...</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName}
                {me && o.id === me.id ? " (You)" : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="text-sm font-semibold text-foreground block mb-1.5">
            Team Members{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (optional, from your department · up to {MAX_TEAM_MEMBERS})
            </span>
          </label>
          {!colleagues || colleagues.length === 0 ? (
            <p className="text-xs text-muted-foreground border border-border rounded-lg px-4 py-2.5">
              No other colleagues in your department yet.
            </p>
          ) : (
            <div className="border border-border rounded-lg max-h-40 overflow-y-auto divide-y divide-border">
              {colleagues.map((c) => {
                const checked = teamMemberIds.includes(c.id);
                const disabled = !checked && teamMemberIds.length >= MAX_TEAM_MEMBERS;
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2.5 px-4 py-2 text-sm text-foreground hover:bg-muted ${
                      disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
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
        {error && <p role="alert" className="text-xs text-danger bg-danger-subtle border border-danger/25 rounded-lg px-3 py-2">{error}</p>}
        {mutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
          </p>
        )}
      </div>
    </div>
  );
});

export default BasicInfoSection;
