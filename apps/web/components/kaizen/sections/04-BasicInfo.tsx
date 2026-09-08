"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { KaizenService } from "@/services/kaizen.service";
import { formatDate, SectionLabel } from "@/components/kaizen/kaizen-ui";
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
  const [title, setTitle] = useState(kaizen.title ?? "");
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
      if (title.trim().length < 5) throw new Error("Title must be at least 5 characters.");
      if (!startDate) throw new Error("Please set a start date.");
      if (!targetCompletionDate) throw new Error("Please set a target completion date.");
      if (duration !== null && (duration < 0 || duration > MAX_DURATION_DAYS)) {
        throw new Error(`Target completion date must be within ${MAX_DURATION_DAYS} days of the start date.`);
      }
      if (!kaizenOwnerId) throw new Error("Please select a kaizen owner.");
      if (teamMemberIds.length > MAX_TEAM_MEMBERS) throw new Error(`You can select up to ${MAX_TEAM_MEMBERS} team members.`);
      return KaizenService.updateBasicInfo(
        kaizen.id,
        {
          title: title.trim(),
          startDate: new Date(startDate).toISOString(),
          targetCompletionDate: new Date(targetCompletionDate).toISOString(),
          kaizenOwnerId,
          teamMemberIds: teamMemberIds.length ? teamMemberIds : undefined,
        },
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
        <SectionLabel n="1.4">Basic Daily Kaizen Information</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Title</p>
            <p className="text-sm text-slate-700">{kaizen.title || "Untitled"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Kaizen Owner</p>
            <p className="text-sm text-slate-700">
              {kaizen.kaizenOwner ? `${kaizen.kaizenOwner.firstName} ${kaizen.kaizenOwner.lastName}` : "Not set"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Start Date</p>
            <p className="text-sm text-slate-700">{kaizen.startDate ? formatDate(kaizen.startDate) : "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Target Completion</p>
            <p className="text-sm text-slate-700">{kaizen.targetCompletionDate ? formatDate(kaizen.targetCompletionDate) : "Not set"}</p>
          </div>
          {kaizen.startDate && kaizen.targetCompletionDate && (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Duration</p>
              <p className="text-sm text-slate-700">
                {durationDays(toIsoDateInput(kaizen.startDate), toIsoDateInput(kaizen.targetCompletionDate))} days
              </p>
            </div>
          )}
          {kaizen.teamMembers.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Team Members</p>
              <p className="text-sm text-slate-700">{kaizen.teamMembers.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="1.4">Basic Daily Kaizen Information</SectionLabel>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Kaizen Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short, descriptive title"
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Target Completion Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={targetCompletionDate}
              min={startDate}
              max={maxTargetDate}
              onChange={(e) => setTargetCompletionDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
        {duration !== null && (
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">Duration</label>
            <p
              className={`text-sm rounded-lg px-4 py-2.5 border ${
                duration < 0 || duration > MAX_DURATION_DAYS
                  ? "border-red-200 bg-red-50 text-red-600"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {duration} day{duration === 1 ? "" : "s"}
            </p>
          </div>
        )}
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Kaizen Owner <span className="text-red-500">*</span>
          </label>
          <select
            value={kaizenOwnerId}
            onChange={(e) => setKaizenOwnerId(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          >
            <option value="">Select an owner...</option>
            {ownerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.firstName} {o.lastName}
                {me && o.id === me.id ? " (You)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Team Members{" "}
            <span className="text-xs font-normal text-slate-400">
              (optional, from your department · up to {MAX_TEAM_MEMBERS})
            </span>
          </label>
          {!colleagues || colleagues.length === 0 ? (
            <p className="text-xs text-slate-400 border border-slate-200 rounded-lg px-4 py-2.5">
              No other colleagues in your department yet.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
              {colleagues.map((c) => {
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

export default BasicInfoSection;
