"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService, SgaMeetingFrequency, SgaWeekday } from "@/services/sga.service";
import { MEETING_FREQUENCY_LABELS, SectionLabel, WEEKDAY_LABELS, WEEKDAY_OPTIONS } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const FREQUENCY_OPTIONS: SgaMeetingFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"];

const MeetingPlanSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function MeetingPlanSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [meetingFrequency, setMeetingFrequency] = useState<SgaMeetingFrequency | "">(sga.meetingFrequency ?? "");
  const [meetingFrequencyCustomText, setMeetingFrequencyCustomText] = useState(sga.meetingFrequencyCustomText ?? "");
  const [meetingDay, setMeetingDay] = useState<SgaWeekday | "">(sga.meetingDay ?? "");
  const [meetingTime, setMeetingTime] = useState(sga.meetingTime ?? "");
  const [meetingDurationMinutes, setMeetingDurationMinutes] = useState(
    sga.meetingDurationMinutes != null ? String(sga.meetingDurationMinutes) : "",
  );
  const [meetingLocation, setMeetingLocation] = useState(sga.meetingLocation ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (meetingFrequency === "CUSTOM" && !meetingFrequencyCustomText.trim()) {
        throw new Error("Please describe the custom meeting schedule.");
      }
      return SgaService.updateMeetingPlan(
        sga.id,
        {
          meetingFrequency: meetingFrequency || undefined,
          meetingFrequencyCustomText: meetingFrequency === "CUSTOM" ? meetingFrequencyCustomText.trim() : undefined,
          meetingDay: meetingFrequency !== "DAILY" && meetingDay ? meetingDay : undefined,
          meetingTime: meetingTime.trim() || undefined,
          meetingDurationMinutes: meetingDurationMinutes ? Number(meetingDurationMinutes) : undefined,
          meetingLocation: meetingLocation.trim() || undefined,
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
        <SectionLabel n="2.2">Meeting Plan</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Frequency</p>
            <p className="text-sm text-slate-700">{sga.meetingFrequency ? MEETING_FREQUENCY_LABELS[sga.meetingFrequency] : "Not set"}</p>
          </div>
          {sga.meetingFrequency === "CUSTOM" ? (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Custom Schedule</p>
              <p className="text-sm text-slate-700">{sga.meetingFrequencyCustomText || "Not set"}</p>
            </div>
          ) : sga.meetingFrequency !== "DAILY" ? (
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Day</p>
              <p className="text-sm text-slate-700">{sga.meetingDay ? WEEKDAY_LABELS[sga.meetingDay] : "Not set"}</p>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Time</p>
            <p className="text-sm text-slate-700">{sga.meetingTime || "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Duration</p>
            <p className="text-sm text-slate-700">{sga.meetingDurationMinutes ? `${sga.meetingDurationMinutes} minutes` : "Not set"}</p>
          </div>
          {sga.meetingLocation && (
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</p>
              <p className="text-sm text-slate-700">{sga.meetingLocation}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.2">Meeting Plan</SectionLabel>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Frequency <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <select
              value={meetingFrequency}
              onChange={(e) => setMeetingFrequency(e.target.value as SgaMeetingFrequency)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            >
              <option value="">Select...</option>
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f} value={f}>
                  {MEETING_FREQUENCY_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
          {meetingFrequency === "CUSTOM" ? (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                Custom schedule <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={meetingFrequencyCustomText}
                onChange={(e) => setMeetingFrequencyCustomText(e.target.value)}
                placeholder="e.g. Every other Tuesday and Friday"
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
            </div>
          ) : meetingFrequency !== "DAILY" ? (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                Day <span className="text-xs font-normal text-slate-400">(optional)</span>
              </label>
              <select
                value={meetingDay}
                onChange={(e) => setMeetingDay(e.target.value as SgaWeekday)}
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              >
                <option value="">Select...</option>
                {WEEKDAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Time <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="time"
              value={meetingTime}
              onChange={(e) => setMeetingTime(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Duration (minutes) <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              min="0"
              value={meetingDurationMinutes}
              onChange={(e) => setMeetingDurationMinutes(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Location <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={meetingLocation}
            onChange={(e) => setMeetingLocation(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
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

export default MeetingPlanSection;
