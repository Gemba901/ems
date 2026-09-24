"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { EmployeeService } from "@/services/employee.service";
import { SgaService } from "@/services/sga.service";
import { formatDate, SectionLabel } from "@/components/sga/sga-ui";
import { SgaSectionHandle, SgaSectionProps } from "./types";

interface ReportForm {
  meetingNumber: string;
  meetingDate: string;
  durationMinutes: string;
  attendeeIds: string[];
  notes: string;
}

const emptyForm = (nextMeetingNumber: number): ReportForm => ({
  meetingNumber: String(nextMeetingNumber),
  meetingDate: "",
  durationMinutes: "",
  attendeeIds: [],
  notes: "",
});

const MeetingReportsSection = forwardRef<SgaSectionHandle, SgaSectionProps>(function MeetingReportsSection(
  { sga, access, token, onSaved },
  ref,
) {
  const nextMeetingNumber = sga.meetingReports.reduce((max, r) => Math.max(max, r.meetingNumber), 0) + 1;
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<ReportForm>(emptyForm(nextMeetingNumber));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ReportForm>(emptyForm(1));
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

  const attendeeOptions = me ? [{ id: me.id, firstName: me.firstName, lastName: me.lastName }, ...(colleagues ?? [])] : (colleagues ?? []);

  const toggleAttendee = (form: ReportForm, setForm: (f: ReportForm) => void, id: string) => {
    setForm({
      ...form,
      attendeeIds: form.attendeeIds.includes(id) ? form.attendeeIds.filter((a) => a !== id) : [...form.attendeeIds, id],
    });
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!addForm.meetingDate) throw new Error("Meeting date is required.");
      return SgaService.createMeetingReport(
        sga.id,
        {
          meetingNumber: Number(addForm.meetingNumber),
          meetingDate: addForm.meetingDate,
          durationMinutes: addForm.durationMinutes ? Number(addForm.durationMinutes) : undefined,
          attendeeIds: addForm.attendeeIds.length ? addForm.attendeeIds : undefined,
          notes: addForm.notes.trim() || undefined,
        },
        token,
      );
    },
    onSuccess: (updated) => {
      onSaved(updated);
      setAdding(false);
      setAddForm(emptyForm(nextMeetingNumber + 1));
    },
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to add meeting report"),
  });

  const updateMutation = useMutation({
    mutationFn: (reportId: string) => {
      if (!editForm.meetingDate) throw new Error("Meeting date is required.");
      return SgaService.updateMeetingReport(
        sga.id,
        reportId,
        {
          meetingDate: editForm.meetingDate,
          durationMinutes: editForm.durationMinutes ? Number(editForm.durationMinutes) : undefined,
          attendeeIds: editForm.attendeeIds,
          notes: editForm.notes.trim() || undefined,
        },
        token,
      );
    },
    onSuccess: (updated) => {
      onSaved(updated);
      setEditingId(null);
    },
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to update meeting report"),
  });

  const deleteMutation = useMutation({
    mutationFn: (reportId: string) => SgaService.deleteMeetingReport(sga.id, reportId, token),
    onSuccess: (updated) => onSaved(updated),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to delete meeting report"),
  });

  useImperativeHandle(ref, () => ({
    save: async () => true,
  }));

  const startEdit = (report: (typeof sga.meetingReports)[number]) => {
    setEditingId(report.id);
    setEditForm({
      meetingNumber: String(report.meetingNumber),
      meetingDate: report.meetingDate.slice(0, 10),
      durationMinutes: report.durationMinutes != null ? String(report.durationMinutes) : "",
      attendeeIds: report.attendeeIds,
      notes: report.notes ?? "",
    });
  };

  const nameFor = (id: string) => {
    const person = attendeeOptions.find((p) => p.id === id);
    return person ? `${person.firstName} ${person.lastName}` : id;
  };

  if (!access.visible) return null;

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm">
      <SectionLabel n="3.1">Meeting Reports</SectionLabel>

      {sga.meetingReports.length === 0 && !adding && (
        <p className="text-sm text-slate-400 mb-3">No meetings logged yet.</p>
      )}

      <div className="space-y-3 mb-4">
        {sga.meetingReports.map((report) => (
          <div key={report.id} className="border border-slate-200 rounded-lg p-4">
            {editingId === report.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Meeting date</label>
                    <input
                      type="date"
                      value={editForm.meetingDate}
                      onChange={(e) => setEditForm({ ...editForm, meetingDate: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Duration (minutes)</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.durationMinutes}
                      onChange={(e) => setEditForm({ ...editForm, durationMinutes: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Attendees</label>
                  <div className="flex flex-wrap gap-2">
                    {attendeeOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleAttendee(editForm, setEditForm, p.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          editForm.attendeeIds.includes(p.id)
                            ? "bg-[#52618a] border-indigo-600 text-white"
                            : "border-slate-200 text-slate-600 hover:border-indigo-300"
                        }`}
                      >
                        {p.firstName} {p.lastName}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={updateMutation.isPending}
                    onClick={() => updateMutation.mutate(report.id)}
                    className="flex items-center gap-1.5 bg-[#52618a] hover:bg-[#445174] disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  >
                    {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    Meeting {report.meetingNumber} · {formatDate(report.meetingDate)}
                    {report.durationMinutes ? ` · ${report.durationMinutes} min` : ""}
                  </p>
                  {report.attendeeIds.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">Attendees: {report.attendeeIds.map(nameFor).join(", ")}</p>
                  )}
                  {report.notes && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{report.notes}</p>}
                </div>
                {access.editable && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => startEdit(report)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(report.id)}
                      disabled={deleteMutation.isPending}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {access.editable && (
        <>
          {adding ? (
            <div className="border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Meeting #</label>
                  <input
                    type="number"
                    min="1"
                    value={addForm.meetingNumber}
                    onChange={(e) => setAddForm({ ...addForm, meetingNumber: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Meeting date</label>
                  <input
                    type="date"
                    value={addForm.meetingDate}
                    onChange={(e) => setAddForm({ ...addForm, meetingDate: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    min="0"
                    value={addForm.durationMinutes}
                    onChange={(e) => setAddForm({ ...addForm, durationMinutes: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Attendees</label>
                <div className="flex flex-wrap gap-2">
                  {attendeeOptions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleAttendee(addForm, setAddForm, p.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        addForm.attendeeIds.includes(p.id)
                          ? "bg-[#52618a] border-indigo-600 text-white"
                          : "border-slate-200 text-slate-600 hover:border-indigo-300"
                      }`}
                    >
                      {p.firstName} {p.lastName}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={addForm.notes}
                  onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={createMutation.isPending}
                  onClick={() => {
                    setError(null);
                    createMutation.mutate();
                  }}
                  className="flex items-center gap-1.5 bg-[#52618a] hover:bg-[#445174] disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                >
                  {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save meeting
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setError(null);
                  }}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAddForm(emptyForm(nextMeetingNumber));
                setAdding(true);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Log a meeting
            </button>
          )}
        </>
      )}

      {error && !adding && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mt-3">{error}</p>}
    </div>
  );
});

export default MeetingReportsSection;
