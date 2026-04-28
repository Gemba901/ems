"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, SuggestionCategory, SuggestionPriority } from "@/services/sims.service";
import { ArrowLeft, Send, Lightbulb, TrendingUp, Shield } from "lucide-react";

const CATEGORIES: { value: SuggestionCategory; label: string; description: string }[] = [
  { value: "QUALITY",    label: "Quality",    description: "Product or process quality improvements" },
  { value: "COST",       label: "Cost",       description: "Cost reduction or financial efficiency" },
  { value: "DELIVERY",   label: "Delivery",   description: "Speed, logistics or turnaround time" },
  { value: "SAFETY",     label: "Safety",     description: "Workplace safety or risk mitigation" },
  { value: "MORALE",     label: "Morale",     description: "Employee wellbeing and culture" },
  { value: "TECHNOLOGY", label: "Technology", description: "Tools, systems or digital improvements" },
];

const PRIORITIES: { value: SuggestionPriority; label: string }[] = [
  { value: "LOW",      label: "Low — Nice to have" },
  { value: "MEDIUM",   label: "Medium — Should address" },
  { value: "HIGH",     label: "High — Needs attention" },
  { value: "CRITICAL", label: "Critical — Urgent impact" },
];

export default function NewSuggestionPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();

  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [category, setCategory]         = useState<SuggestionCategory | "">("");
  const [priority, setPriority]         = useState<SuggestionPriority | "">("");
  const [isAnonymous, setIsAnonymous]   = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !category || !priority) return;

    setSubmitting(true);
    setError(null);

    SimsService.submit(
      { title, description, category, priority, isAnonymous },
      accessToken,
    )
      .then((created) => router.push(`/sims/${created.id}`))
      .catch((err) => { setError(err.message); setSubmitting(false); });
  };

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">

        {/* Back */}
        <Link href="/sims" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Suggestions
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

          {/* LEFT — Form */}
          <div className="xl:col-span-2">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">New Suggestion</h1>
              <p className="text-sm text-slate-500 mt-1">
                Help us evolve. Submit your ideas for improvement across our key performance indicators (QCDSMT). Every voice matters in our culture of continuous innovation.
              </p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Title */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Suggestion Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Implementing AI-driven quality checks in Assembly"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Detailed Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the current problem and your proposed solution. Be specific — include estimated cost or time savings where possible."
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all resize-none"
                  />
                </div>

                {/* Category + Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    >
                      <option value="">Select Category</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    {category && (
                      <p className="text-xs text-slate-400 mt-1.5">
                        {CATEGORIES.find((c) => c.value === category)?.description}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Impact Priority <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as SuggestionPriority)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    >
                      <option value="">Select Priority</option>
                      {PRIORITIES.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Anonymous toggle */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Submit anonymously</p>
                      <p className="text-xs text-slate-400 mt-0.5">Reviewers will see your idea but not your name</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAnonymous((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${isAnonymous ? "bg-blue-600" : "bg-slate-200"}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${isAnonymous ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </label>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting || !category || !priority}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "Submitting..." : "Submit Suggestion"}
                  </button>
                  <Link
                    href="/sims"
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT — Tips + context */}
          <div className="xl:col-span-1 space-y-4">

            {/* Tips card */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-8 w-8 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Lightbulb className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-sm font-bold text-slate-800">Tips for success</p>
              </div>
              <ul className="space-y-2.5 text-sm text-slate-600">
                {[
                  "Be specific about the current challenge.",
                  "Include estimated cost or time savings.",
                  "Reference the relevant QCDSMT category.",
                  "Describe both the problem and your proposed solution.",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Inspirational quote */}
            <div className="bg-slate-800 rounded-2xl p-5 text-white">
              <TrendingUp className="h-5 w-5 text-slate-400 mb-3" />
              <blockquote className="text-sm leading-relaxed text-slate-200 italic">
                "Innovation is the ability to see change as an opportunity — not a threat."
              </blockquote>
              <p className="text-xs text-slate-500 mt-3">— Steve Jobs</p>
            </div>

            {/* QCDSMT reference */}
            <div className="bg-slate-900 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-slate-400" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">QCDSMT Categories</p>
              </div>
              <div className="space-y-2">
                {CATEGORIES.map((c) => (
                  <div key={c.value} className="flex items-center justify-between">
                    <span className="text-sm text-slate-300 font-medium">{c.label}</span>
                    <span className="text-xs text-slate-500 text-right max-w-[140px] leading-snug">{c.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
