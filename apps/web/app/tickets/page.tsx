"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { TicketsService } from "@/services/tickets.service";
import { StatusPill, moduleLabel, formatDateTime } from "@/components/tickets/tickets-ui";
import { Plus, Ticket as TicketIcon, Loader2, ChevronRight } from "lucide-react";

export default function MyTicketsPage() {
  const { accessToken } = useAuthStore();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tickets-mine"],
    queryFn: () => TicketsService.getMine(accessToken!),
    enabled: !!accessToken,
  });

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Tickets</h1>
            <p className="text-sm text-slate-500 mt-1">Raise an issue or request and track its progress.</p>
          </div>
          <Link
            href="/tickets/new"
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" /> Raise a Ticket
          </Link>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
              <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center">
                <TicketIcon className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">You haven&apos;t raised any tickets yet</p>
              <p className="text-xs text-slate-400">Need help with something? Raise a ticket and we&apos;ll take a look.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{moduleLabel(t.module)}</span>
                      <span className="text-slate-200">·</span>
                      <span className="text-[11px] text-slate-400">{formatDateTime(t.createdAt)}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{t.subject}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusPill status={t.status} />
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
