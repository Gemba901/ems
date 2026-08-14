"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService, KaizenTrigger } from "@/services/kaizen.service";
import { KAIZEN_TRIGGERS, SectionLabel } from "@/components/kaizen/kaizen-ui";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send } from "lucide-react";

const EXPLANATION_MIN = 10;
const EXPLANATION_MAX = 1000;

export default function NewKaizenPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [trigger, setTrigger] = useState<KaizenTrigger | "">("");
  const [triggerOther, setTriggerOther] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      KaizenService.create(
        { trigger: trigger as KaizenTrigger, triggerOther: trigger === "OTHER" ? triggerOther.trim() : undefined },
        accessToken!,
      ),
    onSuccess: (created) => router.push(`/kaizen/${created.id}`),
    onError: (err: any) => setError(err instanceof Error ? err.message : "Failed to raise kaizen"),
  });

  const submitting = createMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trigger) {
      setError("Please select why this Daily Kaizen was started.");
      return;
    }
    if (trigger === "OTHER" && (triggerOther.trim().length < EXPLANATION_MIN || triggerOther.trim().length > EXPLANATION_MAX)) {
      setError(`Please explain in ${EXPLANATION_MIN}-${EXPLANATION_MAX} characters.`);
      return;
    }
    setError(null);
    createMutation.mutate();
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 mx-auto">
        <Link href="/kaizen" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Kaizens
        </Link>

        <div className="mb-4">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Part 1 of 9</p>
          <h1 className="text-2xl font-bold text-slate-900">New Daily Kaizen</h1>
          <p className="text-sm text-slate-500 mt-1">Start by telling us why this kaizen was raised. The rest of the form unlocks after this.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-xl p-6 shadow-sm space-y-4">
          <SectionLabel n={1}>Reason</SectionLabel>

          <div>
            <label className="text-sm font-semibold text-slate-700 block mb-1.5">
              Why was this Daily Kaizen started? <span className="text-red-500">*</span>
            </label>
            <select
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value as KaizenTrigger);
                setError(null);
              }}
              className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            >
              <option value="">Select a reason...</option>
              {KAIZEN_TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {trigger === "OTHER" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-slate-700">
                  Please explain <span className="text-red-500">*</span>
                </label>
                <span className={`text-xs ${triggerOther.length > EXPLANATION_MAX ? "text-red-500" : "text-slate-400"}`}>
                  {triggerOther.length}/{EXPLANATION_MAX}
                </span>
              </div>
              <textarea
                rows={4}
                value={triggerOther}
                onChange={(e) => {
                  setTriggerOther(e.target.value);
                  setError(null);
                }}
                placeholder="Describe why this Daily Kaizen was started..."
                className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? "Creating..." : "Continue"}
            </button>
            <Link href="/kaizen" className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
