"use client";

import { useState } from "react";
import {
  X, Clock, Users, Check, CheckCircle2, Loader2, Edit2, Trash2, Globe2, Lock, RefreshCw,
} from "lucide-react";
import {
  AgendaItem, CalendarService, EVENT_COLOR_CONFIG, EventColor,
  HolisticCalendarEvent, CalendarVisit, CalendarRequest, CalendarBlock, BirthdayDetail, HolidayDetail,
} from "@/services/calendar.service";
import { VisitCard } from "./VisitCard";
import { RequestActions } from "./AgendaView";

function cfg(color: string) {
  return EVENT_COLOR_CONFIG[color as EventColor] ?? EVENT_COLOR_CONFIG.GRAPHITE;
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function EventPopover({
  item, token, isAdmin, onClose, onChanged, onEditEvent, onEditVisit, onDeleteVisit, onUnblock,
}: {
  item: AgendaItem;
  token: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
  onEditEvent: (event: HolisticCalendarEvent) => void;
  onEditVisit: (visit: CalendarVisit) => void;
  onDeleteVisit: (id: string) => void;
  onUnblock: (id: string) => void;
}) {
  const c = cfg(item.color);
  const orgColor = item.orgColor || undefined;
  const [responding, setResponding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteScope, setDeleteScope] = useState(false);

  const respond = async (status: "ACCEPTED" | "DECLINED") => {
    setResponding(true);
    try {
      await CalendarService.respondToInvitation(item.id, status, token);
      onChanged();
    } finally {
      setResponding(false);
    }
  };

  const handleDeleteEvent = async (mode?: "THIS_ONLY" | "ALL_IN_SERIES") => {
    setDeleting(true);
    try {
      await CalendarService.deleteEvent(item.id, token, mode);
      onChanged();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <span style={orgColor ? { backgroundColor: orgColor } : undefined} className={`mt-1 h-3 w-3 shrink-0 rounded-full ${orgColor ? "" : c.dot}`} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-snug text-slate-900">{item.title}</h2>
            {!item.allDay ? (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                <Clock className="h-3 w-3" /> {fmtDateTime(item.startAt)} – {fmtTime(item.endAt)}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(item.startAt).split(",")[0]} · All day</p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {(item.kind === "EVENT" || item.kind === "CLIENT_VISIT") && (() => {
            const e = item.detail as HolisticCalendarEvent;
            return (
              <>
                {e.prospectOrgName && (
                  <p className="text-sm font-semibold text-cyan-700">Prospect: {e.prospectOrgName}</p>
                )}
                {e.label && (
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${c.badge}`}>{e.label}</span>
                )}
                {e.description && <p className="text-sm leading-relaxed text-slate-600">{e.description}</p>}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {e.visibility === "ORG_WIDE" ? <Globe2 className="h-3.5 w-3.5" />
                    : e.invitations.length > 0 ? <Users className="h-3.5 w-3.5" />
                    : <Lock className="h-3.5 w-3.5" />}
                  {e.visibility === "ORG_WIDE" ? "Whole organization"
                    : e.invitations.length > 0 ? `Select people (${e.invitations.length})`
                    : "Just you"}
                </div>
                {e.isRecurring && e.recurrencePattern && (
                  <p className="flex items-center gap-1 text-xs font-medium text-violet-500">
                    <RefreshCw className="h-3 w-3" />
                    {(() => {
                      const n = e.recurrenceInterval ?? 1;
                      const unit = e.recurrencePattern === "DAILY" ? (n === 1 ? "day" : "days")
                        : e.recurrencePattern === "WEEKLY" ? (n === 1 ? "week" : "weeks")
                        : e.recurrencePattern === "MONTHLY" ? (n === 1 ? "month" : "months")
                        : n === 1 ? "year" : "years";
                      return n === 1 ? `Repeats every ${unit}` : `Repeats every ${n} ${unit}`;
                    })()}
                  </p>
                )}
                {e.createdBy && (
                  <p className="text-xs text-slate-400">Created by {e.isOwner ? "you" : e.createdBy.name}</p>
                )}
                {e.invitations.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="flex items-center gap-1 text-[10px] font-bold text-slate-400"><Users className="h-3 w-3" /> GUESTS</p>
                    <div className="flex flex-wrap gap-1.5">
                      {e.invitations.map(inv => (
                        <span
                          key={inv.id}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            inv.status === "ACCEPTED"
                              ? "bg-emerald-100 text-emerald-700"
                              : inv.status === "DECLINED"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {inv.invitee.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {e.myInvitationStatus === "PENDING" && (
                  <div className="flex gap-2 border-t border-slate-100 pt-2">
                    <button
                      onClick={() => respond("ACCEPTED")}
                      disabled={responding}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Accept
                    </button>
                    <button
                      onClick={() => respond("DECLINED")}
                      disabled={responding}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                    >
                      {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Decline
                    </button>
                  </div>
                )}
                {e.myInvitationStatus === "ACCEPTED" && (
                  <p className="flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> You accepted</p>
                )}
                {e.myInvitationStatus === "DECLINED" && (
                  <p className="flex items-center gap-1 text-xs font-semibold text-red-500"><X className="h-3.5 w-3.5" /> You declined</p>
                )}

                {e.isOwner && (
                  <div className="flex gap-2 border-t border-slate-100 pt-3">
                    <button
                      onClick={() => onEditEvent(e)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> Edit
                    </button>
                    {!e.isRecurring ? (
                      <button
                        onClick={() => handleDeleteEvent()}
                        disabled={deleting}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                      </button>
                    ) : !deleteScope ? (
                      <button
                        onClick={() => setDeleteScope(true)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    ) : (
                      <div className="flex flex-1 gap-1.5">
                        <button
                          onClick={() => handleDeleteEvent("THIS_ONLY")}
                          disabled={deleting}
                          className="flex-1 rounded-xl border border-red-200 py-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          This event
                        </button>
                        <button
                          onClick={() => handleDeleteEvent("ALL_IN_SERIES")}
                          disabled={deleting}
                          className="flex-1 rounded-xl border border-red-200 py-2 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          All events
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {item.kind === "VISIT" && (
            <VisitCard
              visit={item.detail as CalendarVisit}
              isAdmin={isAdmin}
              onEdit={v => { onEditVisit(v); onClose(); }}
              onDelete={id => { onDeleteVisit(id); onClose(); }}
            />
          )}

          {item.kind === "REQUEST" && (() => {
            const r = item.detail as CalendarRequest;
            return (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-purple-700">{r.isOwn ? "Your visit request" : r.organizationName}</p>
                {r.preferredTime && <p className="text-xs text-purple-600">Preferred time: {r.preferredTime}</p>}
                {r.message && <p className="text-xs text-slate-500">{r.message}</p>}
                {r.responseNote && <p className="border-t border-slate-100 pt-1.5 text-xs text-slate-500">Response: {r.responseNote}</p>}
                {isAdmin && r.status === "PENDING" && (
                  <RequestActions requestId={r.id} token={token} onDone={() => { onChanged(); onClose(); }} />
                )}
              </div>
            );
          })()}

          {item.kind === "BLOCK" && (() => {
            const b = item.detail as CalendarBlock;
            const defaultText = b.employeeName ? `${b.employeeName} is Out of Office` : "Out of Office";
            return (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">{b.label ?? defaultText}</p>
                {isAdmin && (
                  <button
                    onClick={() => { onUnblock(b.id); onClose(); }}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    Remove block
                  </button>
                )}
              </div>
            );
          })()}

          {item.kind === "BIRTHDAY" && (() => {
            const b = item.detail as BirthdayDetail;
            return (
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎂</span>
                <p className="text-sm text-slate-600">It&apos;s {b.name}&apos;s birthday!</p>
              </div>
            );
          })()}

          {item.kind === "HOLIDAY" && (() => {
            const h = item.detail as HolidayDetail;
            return (
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎉</span>
                <p className="text-sm text-slate-600">{h.name} — public holiday in Kenya.</p>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
