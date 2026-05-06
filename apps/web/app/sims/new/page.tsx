"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SimsService, SuggestionCategory } from "@/services/sims.service";
import { ArrowLeft, Send, CheckSquare, Square } from "lucide-react";
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

const CATEGORY_GUIDE: { label: string; summary: string; action: string; items: string[]; color: string }[] = [
  { label: "Quality",    summary: "Better product, service, or work accuracy.", action: "Reduces",  items: ["Defects", "Errors", "Rework", "Complaints"],              color: "text-blue-700" },
  { label: "Cost",       summary: "Lower cost or better use of resources.",      action: "Reduces",  items: ["Waste", "Loss", "Overtime", "Energy"],                    color: "text-emerald-700" },
  { label: "Delivery",   summary: "Faster and smoother workflow.",               action: "Reduces",  items: ["Delay", "Waiting", "Searching", "Lead time"],             color: "text-purple-700" },
  { label: "Safety",     summary: "Safer workplace with lower risk.",             action: "Removes",  items: ["Hazards", "Unsafe acts", "Injury risk"],                  color: "text-red-700" },
  { label: "Morale",     summary: "Easier and better work for people.",           action: "Reduces",  items: ["Stress", "Confusion", "Frustration"],                     color: "text-amber-700" },
  { label: "Technology", summary: "Better tools, systems, data, or digital work.", action: "Improves", items: ["Software", "Automation", "Dashboards", "Tracking"],     color: "text-indigo-700" },
];

const FIVE_W2H: { key: string; desc: string }[] = [
  { key: "What",     desc: "What problem or improvement opportunity do you see?" },
  { key: "Where",    desc: "Where is it happening? Department, line, machine, area, or process." },
  { key: "When",     desc: "When does it happen? Shift, time, frequency, or situation." },
  { key: "Who",      desc: "Who is affected? Operator, supervisor, customer, team, or department." },
  { key: "Why",      desc: "Why is it important? Delay, waste, defect, risk, confusion, or extra cost." },
  { key: "How",      desc: "How can it be improved? Suggest a practical solution." },
  { key: "How Much", desc: "What impact is expected? Time saving, cost saving, waste reduction, risk reduction, or easier work." },
];

const EXAMPLES: { context: string; suggestion: string; impact: { cat: string; note: string; color: string }[] }[] = [
  {
    context: "Operators on Packing Line 2 spend time searching for tape and cutters during the morning shift.",
    suggestion: "Fix a small shadow board near the line.",
    impact: [
      { cat: "Delivery", note: "Reduces searching time and packing delay.",                    color: "text-purple-700" },
      { cat: "Morale",   note: "Makes work easier and reduces frustration.",                   color: "text-amber-700" },
      { cat: "Safety",   note: "Keeps tools in the correct place and reduces unsafe handling.", color: "text-red-700" },
    ],
  },
  {
    context: "Truck loading and offloading takes too much time because cartons are handled manually.",
    suggestion: "Use a movable conveyor that can go inside the truck or container. Barcode scanning or sensors can also be added for dispatch control.",
    impact: [
      { cat: "Delivery",   note: "Reduces loading and offloading time.",       color: "text-purple-700" },
      { cat: "Morale",     note: "Reduces hard manual work for the team.",     color: "text-amber-700" },
      { cat: "Quality",    note: "Reduces carton damage and wrong dispatch.",  color: "text-blue-700" },
      { cat: "Technology", note: "Supports barcode or sensor-based control.",  color: "text-indigo-700" },
    ],
  },
];

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

          {/* LEFT , Form */}
          <div className="xl:col-span-2">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">New Suggestion</h1>
              <p className="text-sm text-slate-500 mt-1">
                Help us evolve. Submit your ideas across our QCDSMT pillars, every voice matters.
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
                    placeholder="Describe the current problem and your proposed solution. Be specific , include estimated cost or time savings where possible."
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

          {/* RIGHT — Submission Guide */}
          <div className="xl:col-span-1">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden sticky top-6">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                <p className="text-sm font-bold text-slate-800">Submission Guide</p>
                <p className="text-xs text-slate-500 mt-0.5">Category explanations, writing tips & examples</p>
              </div>

              <div className="overflow-y-auto max-h-[calc(100vh-10rem)] divide-y divide-slate-100">

                {/* Section 1 — QCDSMT Category Explanation */}
                <div className="px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">QCDSMT Category Explanation</p>
                  <div className="space-y-4">
                    {CATEGORY_GUIDE.map((c) => (
                      <div key={c.label}>
                        <span className={`text-[11px] font-bold mb-1 block ${c.color}`}>{c.label}</span>
                        <p className="text-xs text-slate-700 mb-0.5">{c.summary}</p>
                        <p className="text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-500">{c.action}:</span>{" "}
                          {c.items.join(" · ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 2 — How to Write a Good Suggestion */}
                <div className="px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">How to Write a Good Suggestion</p>
                  <p className="text-xs text-slate-600 mb-3">
                    A good suggestion should be <span className="font-semibold text-slate-800">simple, clear, and useful</span>. It should explain the problem, the suggested improvement, and the expected impact.
                  </p>
                  <p className="text-xs text-slate-500 mb-2">Try to cover <span className="font-semibold text-slate-700">5W2H</span> where possible:</p>
                  <div className="space-y-2">
                    {FIVE_W2H.map((w) => (
                      <div key={w.key} className="flex gap-2">
                        <span className="text-[11px] font-bold text-slate-700 shrink-0 w-14">{w.key}</span>
                        <span className="text-[11px] text-slate-500 leading-relaxed">{w.desc}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                    <span className="font-semibold text-slate-500">Note:</span> You do not need to answer every point perfectly. Just explain clearly so the suggestion can be reviewed and acted on.
                  </p>
                </div>

                {/* Section 3 — Examples */}
                <div className="px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Examples</p>
                  <div className="space-y-5">
                    {EXAMPLES.map((ex, i) => (
                      <div key={i}>
                        <p className="text-[11px] font-bold text-slate-600 mb-1">Example {i + 1}</p>
                        <p className="text-xs text-slate-500 leading-relaxed mb-2">{ex.context}</p>
                        <p className="text-xs text-slate-700 mb-2">
                          <span className="font-semibold">Suggestion:</span> {ex.suggestion}
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Expected Impact:</p>
                        <div className="space-y-1">
                          {ex.impact.map((imp) => (
                            <div key={imp.cat} className="flex gap-1.5 items-baseline">
                              <span className={`text-[10px] font-bold shrink-0 ${imp.color}`}>{imp.cat}</span>
                              <span className="text-[11px] text-slate-500 leading-relaxed">{imp.note}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
