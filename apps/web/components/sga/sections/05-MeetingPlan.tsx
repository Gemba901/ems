"use client";

import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SgaService, SgaMeetingFrequency, SgaWeekday } from "@/services/sga.service";
import { MEETING_FREQUENCY_LABELS, SectionLabel, WEEKDAY_OPTIONS } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

const FREQUENCY_OPTIONS: SgaMeetingFrequency[] = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"];

function computeDurationMinutes(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : diff + 24 * 60;
}

const MeetingPlanSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function MeetingPlanSection(
  { sga, access, token, onSaved },
  ref,
) {
  const [meetingFrequency, setMeetingFrequency] = useState<SgaMeetingFrequency | "">(
    // Weekly is the usual SGA rhythm; pre-select it so the raiser only changes it if needed.
    sga.meetingFrequency ?? (access.editable ? "WEEKLY" : ""),
  );
  const [meetingFrequencyCustomText, setMeetingFrequencyCustomText] = useState(sga.meetingFrequencyCustomText ?? "");
  const [meetingDay, setMeetingDay] = useState<SgaWeekday | "">(sga.meetingDay ?? "");
  const [meetingTime, setMeetingTime] = useState(sga.meetingTime ?? "");
  const [meetingEndTime, setMeetingEndTime] = useState(sga.meetingEndTime ?? "");
  const [meetingLocation, setMeetingLocation] = useState(sga.meetingLocation ?? "");
  const [error, setError] = useState<string | null>(null);
  const editable = access.editable;

  const durationMinutes = useMemo(() => computeDurationMinutes(meetingTime, meetingEndTime), [meetingTime, meetingEndTime]);

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
          meetingEndTime: meetingEndTime.trim() || undefined,
          meetingDurationMinutes: durationMinutes ?? undefined,
          meetingLocation: meetingLocation.trim() || undefined,
        },
        token,
      );
    },
    onSuccess: (updated) => {
      setError(null);
      onSaved(updated);
    },
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

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="2.2">Team meetings</SectionLabel>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              How often? <span className="text-red-500">*</span>
            </label>
            <select
              value={meetingFrequency}
              disabled={!editable}
              onChange={(e) => setMeetingFrequency(e.target.value as SgaMeetingFrequency)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
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
                disabled={!editable}
                onChange={(e) => setMeetingFrequencyCustomText(e.target.value)}
                placeholder="e.g. Every other Tuesday and Friday"
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>
          ) : meetingFrequency !== "DAILY" ? (
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                Day <span className="text-xs font-normal text-slate-400">(optional)</span>
              </label>
              <select
                value={meetingDay}
                disabled={!editable}
                onChange={(e) => setMeetingDay(e.target.value as SgaWeekday)}
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
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
              Start time <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="time"
              value={meetingTime}
              disabled={!editable}
              onChange={(e) => setMeetingTime(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              End time <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="time"
              value={meetingEndTime}
              disabled={!editable}
              onChange={(e) => setMeetingEndTime(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">Duration</label>
            <p className="w-full border border-slate-100 bg-slate-50 rounded-lg px-4 py-2.5 text-sm text-slate-500">
              {durationMinutes != null ? `${durationMinutes} minutes` : "Set start and end time"}
            </p>
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700 block mb-1.5">
            Location <span className="text-xs font-normal text-slate-400">(optional)</span>
          </label>
          <input
            type="text"
            value={meetingLocation}
            disabled={!editable}
            onChange={(e) => setMeetingLocation(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all disabled:bg-slate-50 disabled:text-slate-500"
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
