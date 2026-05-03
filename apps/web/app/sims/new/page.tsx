"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, SuggestionCategory } from "@/services/sims.service";
import { ArrowLeft, Send, Lightbulb, TrendingUp, Shield, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/contexts/toast.context";

const QCDSMT_CATEGORIES: { value: SuggestionCategory; label: string; description: string; color: string }[] = [
  { value: "QUALITY",    label: "Quality",    description: "Product or process quality",     color: "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400" },
  { value: "COST",       label: "Cost",       description: "Cost reduction / efficiency",    color: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400" },
  { value: "DELIVERY",   label: "Delivery",   description: "Speed, logistics, turnaround",   color: "border-purple-200 bg-purple-50 text-purple-700 hover:border-purple-400" },
  { value: "SAFETY",     label: "Safety",     description: "Workplace safety & risk",        color: "border-red-200 bg-red-50 text-red-700 hover:border-red-400" },
  { value: "MORALE",     label: "Morale",     description: "Employee wellbeing & culture",   color: "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400" },
  { value: "TECHNOLOGY", label: "Technology", description: "Tools, systems, digital",        color: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-400" },
];

const ALL_QCDSMT: SuggestionCategory[] = QCDSMT_CATEGORIES.map((c) => c.value);

const TITLE_MIN = 10;
const TITLE_MAX = 200;
const DESC_MIN  = 20;
const DESC_MAX  = 2000;

function validate(title: string, description: string, categories: SuggestionCategory[]) {
  if (title.trim().length < TITLE_MIN) return `Title must be at least ${TITLE_MIN} characters.`;
  if (title.trim().length > TITLE_MAX) return `Title must be under ${TITLE_MAX} characters.`;
  if (description.trim().length < DESC_MIN) return `Description must be at least ${DESC_MIN} characters.`;
  if (description.trim().length > DESC_MAX) return `Description must be under ${DESC_MAX} characters.`;
  if (categories.length === 0) return "Please select at least one category.";
  return null;
}

export default function NewSuggestionPage() {
  const router      = useRouter();
  const { accessToken } = useAuthStore();
  const { toast } = useToast();

  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [categories, setCategories]   = useState<SuggestionCategory[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const toggleCategory = (val: SuggestionCategory) => {
    setCategories((prev) =>
      prev.includes(val) ? prev.filter((c) => c !== val) : [...prev, val]
    );
    setFieldErrors((e) => ({ ...e, categories: "" }));
  };

  const selectAll = () => {
    setCategories(ALL_QCDSMT);
    setFieldErrors((e) => ({ ...e, categories: "" }));
  };

  const selectUnknown = () => {
    setCategories(["UNKNOWN"]);
    setFieldErrors((e) => ({ ...e, categories: "" }));
  };

  const clearCategories = () => setCategories([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(title, description, categories);
    if (validationError) { setError(validationError); return; }

    if (!accessToken) return;
    setSubmitting(true);
    setError(null);

    SimsService.submit({ title: title.trim(), description: description.trim(), categories, isAnonymous }, accessToken)
      .then((created) => {
        toast("Thank you for your suggestion! It has been submitted for review.", "success");
        router.push(`/sims/${created.id}`);
      })
      .catch((err) => { setError(err.message); setSubmitting(false); });
  };

  const isUnknownSelected = categories.includes("UNKNOWN");
  const isAllSelected     = ALL_QCDSMT.every((c) => categories.includes(c));
  const canSubmit         = !submitting && categories.length > 0 && title.trim().length >= TITLE_MIN && description.trim().length >= DESC_MIN;

  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE]}>
      <div className="px-4 py-4 md:px-8 md:py-6 max-w-7xl mx-auto">

        <Link href="/sims" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Suggestions
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

          {/* LEFT — Form */}
          <div className="xl:col-span-2">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">New Suggestion</h1>
              <p className="text-sm text-slate-500 mt-1">
                Help us evolve. Submit your ideas across our QCDSMT pillars — every voice matters.
              </p>
            </div>

            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-6">

                {/* Title */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      Problem Identified <span className="text-red-500">*</span>
                    </label>
                    <span className={`text-xs ${title.length > TITLE_MAX ? "text-red-500" : "text-slate-400"}`}>
                      {title.length}/{TITLE_MAX}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setError(null); }}
                    placeholder="e.g., Reduce rework rate in the Assembly line"
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
                      title.length > 0 && title.length < TITLE_MIN
                        ? "border-amber-300 focus:ring-amber-500/20 focus:border-amber-400"
                        : "border-slate-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                  {title.length > 0 && title.length < TITLE_MIN && (
                    <p className="text-xs text-amber-600 mt-1">{TITLE_MIN - title.length} more characters needed</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold text-slate-700">
                      My Suggestion for Improvement <span className="text-red-500">*</span>
                    </label>
                    <span className={`text-xs ${description.length > DESC_MAX ? "text-red-500" : "text-slate-400"}`}>
                      {description.length}/{DESC_MAX}
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => { setDescription(e.target.value); setError(null); }}
                    placeholder="Describe the current problem and your proposed solution. Be specific — include estimated cost or time savings where possible."
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all resize-none ${
                      description.length > 0 && description.length < DESC_MIN
                        ? "border-amber-300 focus:ring-amber-500/20 focus:border-amber-400"
                        : "border-slate-200 focus:ring-blue-500/20 focus:border-blue-400"
                    }`}
                  />
                  {description.length > 0 && description.length < DESC_MIN && (
                    <p className="text-xs text-amber-600 mt-1">{DESC_MIN - description.length} more characters needed</p>
                  )}
                </div>

                {/* Category multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Category <span className="text-red-500">*</span>
                      <span className="ml-2 text-xs font-normal text-slate-400">Select all that apply</span>
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <button type="button" onClick={selectAll} className="text-blue-600 hover:underline">All</button>
                      <span className="text-slate-300">·</span>
                      <button type="button" onClick={selectUnknown} className="text-slate-500 hover:underline">I don't know</button>
                      {categories.length > 0 && (
                        <>
                          <span className="text-slate-300">·</span>
                          <button type="button" onClick={clearCategories} className="text-red-400 hover:underline">Clear</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* QCDSMT grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {QCDSMT_CATEGORIES.map((cat) => {
                      const selected = categories.includes(cat.value);
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => { if (!isUnknownSelected) toggleCategory(cat.value); }}
                          disabled={isUnknownSelected}
                          className={`relative flex items-start gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                            isUnknownSelected
                              ? "border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed"
                              : selected
                                ? `${cat.color} border-opacity-100 ring-1 ring-current/20`
                                : `border-slate-200 bg-white hover:border-slate-300`
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {selected
                              ? <CheckSquare className="h-3.5 w-3.5" />
                              : <Square className="h-3.5 w-3.5 text-slate-300" />
                            }
                          </div>
                          <div>
                            <p className="text-xs font-semibold leading-none mb-0.5">{cat.label}</p>
                            <p className="text-[10px] text-slate-400 leading-snug">{cat.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* "I don't know" pill */}
                  <button
                    type="button"
                    onClick={() => isUnknownSelected ? clearCategories() : selectUnknown()}
                    className={`mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all ${
                      isUnknownSelected
                        ? "border-slate-400 bg-slate-100 text-slate-700"
                        : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                    }`}
                  >
                    {isUnknownSelected
                      ? <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                      : <Square className="h-3.5 w-3.5 shrink-0" />
                    }
                    <span className="text-xs font-medium">I don't know which category applies</span>
                  </button>

                  {categories.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">
                      Selected: <span className="font-medium text-slate-700">
                        {isUnknownSelected ? "Unknown" : categories.map((c) => c.charAt(0) + c.slice(1).toLowerCase()).join(", ")}
                      </span>
                    </p>
                  )}
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

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "Submitting..." : "Submit Suggestion"}
                  </button>
                  <Link href="/sims" className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
                    Cancel
                  </Link>
                </div>
              </form>
            </div>
          </div>

          {/* RIGHT — Tips */}
          <div className="xl:col-span-1 space-y-4">
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
                  "You can select multiple QCDSMT categories.",
                  "Describe both the problem and your solution.",
                ].map((tip) => (
                  <li key={tip} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-800 rounded-2xl p-5 text-white">
              <TrendingUp className="h-5 w-5 text-slate-400 mb-3" />
              <blockquote className="text-sm leading-relaxed text-slate-200 italic">
                "Innovation is the ability to see change as an opportunity — not a threat."
              </blockquote>
              <p className="text-xs text-slate-500 mt-3">— Steve Jobs</p>
            </div>

            <div className="bg-slate-900 rounded-2xl p-5 text-white">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="h-4 w-4 text-slate-400" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">QCDSMT Categories</p>
              </div>
              <div className="space-y-2">
                {QCDSMT_CATEGORIES.map((c) => (
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
