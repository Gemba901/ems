"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { TicketsService } from "@/services/tickets.service";
import { StatusPill, moduleLabel, formatDateTime } from "@/components/tickets/tickets-ui";
import { ArrowLeft, Ticket as TicketIcon, Loader2, ChevronRight } from "lucide-react";

type Tab = "company" | "system";

export default function TicketsSettingsPage() {
  const { accessToken, user } = useAuthStore();
  const isSuperAdmin = user?.roleLevel === Role.SUPER_ADMIN;
  const [tab, setTab] = useState<Tab>("company");

  const { data: companyTickets = [], isLoading: loadingCompany } = useQuery({
    queryKey: ["tickets-company"],
    queryFn: () => TicketsService.getCompanyTickets(accessToken!),
    enabled: !!accessToken && tab === "company",
  });

  const { data: systemTickets = [], isLoading: loadingSystem } = useQuery({
    queryKey: ["tickets-system"],
    queryFn: () => TicketsService.getSystemTickets(accessToken!),
    enabled: !!accessToken && isSuperAdmin && tab === "system",
  });

  const tickets = tab === "company" ? companyTickets : systemTickets;
  const isLoading = tab === "company" ? loadingCompany : loadingSystem;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN]}>
      <div className="space-y-6">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Settings
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tickets</h1>
          <p className="text-sm text-slate-500 mt-1">Review and resolve tickets raised by your team.</p>
        </div>

        {isSuperAdmin && (
          <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setTab("company")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === "company" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Company
            </button>
            <button
              onClick={() => setTab("system")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === "system" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              System
            </button>
          </div>
        )}

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
              <p className="text-sm font-medium text-slate-500">No {tab} tickets yet</p>
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
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{moduleLabel(t.module)}</span>
                      <span className="text-slate-200">·</span>
                      <span className="text-[11px] text-slate-400">
                        {t.raisedBy.firstName} {t.raisedBy.lastName}{t.department ? ` · ${t.department}` : ""}
                      </span>
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
