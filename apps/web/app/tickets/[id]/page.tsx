"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { TicketsService, TicketStatus, TicketType } from "@/services/tickets.service";
import { StatusPill, TypePill, STATUS_OPTIONS, STATUS_LABELS, TYPE_LABELS, moduleLabel, formatDateTime } from "@/components/tickets/tickets-ui";
import { ArrowLeft, Loader2, Send, MessageSquare, ArrowUpCircle } from "lucide-react";

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { accessToken, user } = useAuthStore();
  const queryClient = useQueryClient();

  const canManage = user?.roleLevel === Role.SUPER_ADMIN || user?.roleLevel === Role.ADMIN;

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => TicketsService.getById(id, accessToken!),
    enabled: !!accessToken && !!id,
  });

  const [statusChanged, setStatusChanged] = useState<TicketStatus | "">("");
  const [note, setNote] = useState("");

  const updateMutation = useMutation({
    mutationFn: (payload: { statusChanged?: TicketStatus; typeChanged?: TicketType; note?: string }) =>
      TicketsService.update(id, payload, accessToken!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      setStatusChanged("");
      setNote("");
    },
  });

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusChanged && !note.trim()) return;
    updateMutation.mutate({
      ...(statusChanged && { statusChanged }),
      ...(note.trim() && { note: note.trim() }),
    });
  };

  const handleEscalate = () => {
    updateMutation.mutate({ typeChanged: "SYSTEM_TICKET" });
  };

  if (isLoading) {
    return (
      <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      </ProtectedRoute>
    );
  }

  if (error || !ticket) {
    return (
      <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
        <div className="max-w-2xl mx-auto text-center py-16">
          <p className="text-sm text-red-600">{error instanceof Error ? error.message : "Ticket not found"}</p>
          <Link href="/tickets" className="text-sm text-indigo-600 hover:underline mt-2 inline-block">Back to My Tickets</Link>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="space-y-6">
        <Link href="/tickets" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to My Tickets
        </Link>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <TypePill type={ticket.type} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{moduleLabel(ticket.module)}</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900">{ticket.subject}</h1>
            </div>
            <StatusPill status={ticket.status} />
          </div>

          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{ticket.message}</p>

          <div className="flex items-center gap-4 text-xs text-slate-400 pt-2 border-t border-slate-100">
            <span>Raised by <span className="font-medium text-slate-600">{ticket.raisedBy.firstName} {ticket.raisedBy.lastName}</span></span>
            {ticket.department && <span>· {ticket.department}</span>}
            <span>· {formatDateTime(ticket.createdAt)}</span>
          </div>
        </div>

        {/* Update thread */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-400" /> Activity
          </p>
          {ticket.updates.length === 0 ? (
            <p className="text-xs text-slate-400">No updates yet.</p>
          ) : (
            <div className="space-y-3">
              {ticket.updates.map((u) => (
                <div key={u.id} className="flex gap-3 text-sm">
                  <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-[10px] font-bold text-slate-600">
                    {u.updatedBy.firstName[0]}{u.updatedBy.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{u.updatedBy.firstName} {u.updatedBy.lastName}</span>
                      {u.statusChanged && <> changed status to <span className="font-medium text-slate-700">{STATUS_LABELS[u.statusChanged]}</span></>}
                      {u.typeChanged && <> escalated this to a <span className="font-medium text-slate-700">{TYPE_LABELS[u.typeChanged]}</span> ticket</>}
                      <span className="text-slate-400"> · {formatDateTime(u.createdAt)}</span>
                    </p>
                    {u.note && <p className="text-sm text-slate-600 mt-1">{u.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin controls */}
        {canManage && (
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
            <p className="text-sm font-bold text-slate-800">Manage Ticket</p>
            <form onSubmit={handleUpdate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Update Status</label>
                  <select
                    value={statusChanged}
                    onChange={(e) => setStatusChanged(e.target.value as TicketStatus | "")}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                  >
                    <option value="">No change</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Note to raiser (optional)</label>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add context or a resolution note…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={updateMutation.isPending || (!statusChanged && !note.trim())}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Save Update
                </button>
                {ticket.type === "COMPANY_TICKET" && (
                  <button
                    type="button"
                    onClick={handleEscalate}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700 disabled:opacity-50 transition-colors"
                  >
                    <ArrowUpCircle className="h-4 w-4" /> Escalate to System Ticket
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
