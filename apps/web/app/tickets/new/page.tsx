"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { TicketsService, TICKET_MODULES } from "@/services/tickets.service";
import { MODULE_LABELS } from "@/components/tickets/tickets-ui";
import { ArrowLeft, Send, Loader2 } from "lucide-react";

const SUBJECT_MAX = 150;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

export default function NewTicketPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [module, setModule] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: () => TicketsService.create({ module, subject: subject.trim(), message: message.trim(), department: department.trim() }, accessToken!),
    onSuccess: (created) => router.push(`/tickets/${created.id}`),
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Failed to raise ticket"),
  });

  const submitting = submitMutation.isPending;
  const canSubmit =
    !submitting &&
    !!module &&
    subject.trim().length > 0 &&
    message.trim().length >= MESSAGE_MIN &&
    department.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    submitMutation.mutate();
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD, Role.EMPLOYEE]}>
      <div className="space-y-6">
        <Link href="/tickets" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to My Tickets
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Raise a Ticket</h1>
          <p className="text-sm text-slate-500 mt-1">Describe the issue or request. An administrator will follow up.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5">
          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Which area does this concern? <span className="text-red-500">*</span>
            </label>
            <select
              value={module}
              onChange={(e) => { setModule(e.target.value); setError(null); }}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            >
              <option value="">Select an area…</option>
              {TICKET_MODULES.map((m) => (
                <option key={m} value={m}>{MODULE_LABELS[m]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Your Department <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setError(null); }}
              placeholder="e.g. Production, HR, Finance"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Subject <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${subject.length > SUBJECT_MAX ? "text-red-500" : "text-slate-400"}`}>
                {subject.length}/{SUBJECT_MAX}
              </span>
            </div>
            <input
              type="text"
              value={subject}
              onChange={(e) => { setSubject(e.target.value.slice(0, SUBJECT_MAX)); setError(null); }}
              placeholder="Brief summary of the issue"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-slate-700">
                Details <span className="text-red-500">*</span>
              </label>
              <span className={`text-xs ${message.length > MESSAGE_MAX ? "text-red-500" : "text-slate-400"}`}>
                {message.length}/{MESSAGE_MAX}
              </span>
            </div>
            <textarea
              rows={6}
              value={message}
              onChange={(e) => { setMessage(e.target.value.slice(0, MESSAGE_MAX)); setError(null); }}
              placeholder="Describe what's happening, when it started, and any steps you've already tried."
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all resize-none"
            />
            {message.length > 0 && message.length < MESSAGE_MIN && (
              <p className="text-xs text-amber-600 mt-1">{MESSAGE_MIN - message.length} more characters needed</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            >
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> Submit Ticket</>}
            </button>
            <Link href="/tickets" className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
