"use client";

import { Button } from "@/components/ui/button";

import { useState } from "react";
import {
  X, Users, Check, CheckCircle2, Loader2, Edit2, Trash2, Globe2, Lock, RefreshCw,
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

export function AgendaItemBody({
  item, token, isAdmin, onChanged, onEditEvent, onDeleteVisit, onUnblock, onClose,
}: {
  item: AgendaItem;
  token: string;
  isAdmin: boolean;
  onChanged: () => void;
  onEditEvent: (event: HolisticCalendarEvent) => void;
  onDeleteVisit: (id: string) => void;
  onUnblock: (id: string) => void;
  onClose?: () => void;
}) {
  const c = cfg(item.color);
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
      onClose?.();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {(item.kind === "EVENT" || item.kind === "CLIENT_VISIT") && (() => {
        const e = item.detail as HolisticCalendarEvent;
        return (
          <>
            {e.prospectOrgName && (
              <p className="text-sm font-semibold text-info">Prospect: {e.prospectOrgName}</p>
            )}
            {e.label && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${c.badge}`}>{e.label}</span>
            )}
            {e.description && <p className="text-sm leading-relaxed text-muted-foreground">{e.description}</p>}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {e.visibility === "ORG_WIDE" ? <Globe2 className="h-3.5 w-3.5" />
                : e.invitations.length > 0 ? <Users className="h-3.5 w-3.5" />
                : <Lock className="h-3.5 w-3.5" />}
              {e.visibility === "ORG_WIDE" ? "Whole organization"
                : e.invitations.length > 0 ? `Select people (${e.invitations.length})`
                : "Just you"}
            </div>
            {e.isRecurring && e.recurrencePattern && (
              <p className="flex items-center gap-1 text-xs font-medium text-primary">
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
              <p className="text-xs text-muted-foreground">Created by {e.isOwner ? "you" : e.createdBy.name}</p>
            )}
            {e.invitations.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Users className="h-3 w-3" /> GUESTS</p>
                <div className="flex flex-wrap gap-1.5">
                  {e.invitations.map(inv => (
                    <span
                      key={inv.id}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        inv.status === "ACCEPTED"
                          ? "bg-success-subtle text-success"
                          : inv.status === "DECLINED"
                          ? "bg-danger-subtle text-danger"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {inv.invitee.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {e.myInvitationStatus === "PENDING" && (
              <div className="flex gap-2 border-t border-border pt-2">
                <Button variant="ghost"
                  onClick={() => respond("ACCEPTED")}
                  disabled={responding}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success py-2 text-sm font-semibold text-success-foreground transition-colors hover:bg-success disabled:opacity-50"
                >
                  {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Accept
                </Button>
                <Button variant="ghost"
                  onClick={() => respond("DECLINED")}
                  disabled={responding}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-danger py-2 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger disabled:opacity-50"
                >
                  {responding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Decline
                </Button>
              </div>
            )}
            {e.myInvitationStatus === "ACCEPTED" && (
              <p className="flex items-center gap-1 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> You accepted</p>
            )}
            {e.myInvitationStatus === "DECLINED" && (
              <p className="flex items-center gap-1 text-xs font-semibold text-danger"><X className="h-3.5 w-3.5" /> You declined</p>
            )}

            {e.isOwner && (
              <div className="flex gap-2 border-t border-border pt-3">
                <Button variant="ghost"
                  onClick={() => onEditEvent(e)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </Button>
                {!e.isRecurring ? (
                  <Button variant="ghost"
                    onClick={() => handleDeleteEvent()}
                    disabled={deleting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger/20 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                  </Button>
                ) : !deleteScope ? (
                  <Button variant="ghost"
                    onClick={() => setDeleteScope(true)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-danger/20 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-subtle"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                ) : (
                  <div className="flex flex-1 gap-1.5">
                    <Button variant="ghost"
                      onClick={() => handleDeleteEvent("THIS_ONLY")}
                      disabled={deleting}
                      className="h-auto min-w-0 whitespace-normal flex-1 rounded-xl border border-danger/20 py-2 text-[11px] font-medium text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                    >
                      This event
                    </Button>
                    <Button variant="ghost"
                      onClick={() => handleDeleteEvent("ALL_IN_SERIES")}
                      disabled={deleting}
                      className="h-auto min-w-0 whitespace-normal flex-1 rounded-xl border border-danger/20 py-2 text-[11px] font-medium text-danger transition-colors hover:bg-danger-subtle disabled:opacity-50"
                    >
                      All events
                    </Button>
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
          token={token}
          isAdmin={isAdmin}
          onSaved={onChanged}
          onDelete={id => { onDeleteVisit(id); onClose?.(); }}
        />
      )}

      {item.kind === "REQUEST" && (() => {
        const r = item.detail as CalendarRequest;
        return (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary">{r.isOwn ? "Your visit request" : r.organizationName}</p>
            {r.preferredTime && <p className="text-xs text-primary">Preferred time: {r.preferredTime}</p>}
            {r.message && <p className="text-xs text-muted-foreground">{r.message}</p>}
            {r.responseNote && <p className="border-t border-border pt-1.5 text-xs text-muted-foreground">Response: {r.responseNote}</p>}
            {isAdmin && r.status === "PENDING" && (
              <RequestActions requestId={r.id} token={token} onDone={() => { onChanged(); onClose?.(); }} />
            )}
          </div>
        );
      })()}

      {item.kind === "BLOCK" && (() => {
        const b = item.detail as CalendarBlock;
        const defaultText = b.employeeName ? `${b.employeeName} is Out of Office` : "Out of Office";
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{b.label ?? defaultText}</p>
            {isAdmin && (
              <Button variant="ghost"
                onClick={() => { onUnblock(b.id); onClose?.(); }}
                className="rounded-xl border border-danger/20 px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-subtle"
              >
                Remove block
              </Button>
            )}
          </div>
        );
      })()}

      {item.kind === "BIRTHDAY" && (() => {
        const b = item.detail as BirthdayDetail;
        return (
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎂</span>
            <p className="text-sm text-muted-foreground">It&apos;s {b.name}&apos;s birthday!</p>
          </div>
        );
      })()}

      {item.kind === "HOLIDAY" && (() => {
        const h = item.detail as HolidayDetail;
        return (
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <p className="text-sm text-muted-foreground">{h.name} — public holiday in Kenya.</p>
          </div>
        );
      })()}
    </>
  );
}
