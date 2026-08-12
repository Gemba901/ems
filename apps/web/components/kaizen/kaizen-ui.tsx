import { KaizenStatus, KaizenTrigger } from "@/services/kaizen.service";
import { ChevronLeft, ChevronRight, ImageOff, Check, Lightbulb } from "lucide-react";

export const STATUS_LABELS: Record<KaizenStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  SUBMITTED_FOR_VERIFICATION: "Pending Verification",
  VERIFIED_CLOSED: "Verified",
  FURTHER_IMPROVEMENT_REQUIRED: "Needs More Work",
  MOVED_TO_SGA: "Moved to SGA",
};

export const STATUS_BADGE: Record<KaizenStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  SUBMITTED_FOR_VERIFICATION: "bg-amber-100 text-amber-700",
  VERIFIED_CLOSED: "bg-emerald-100 text-emerald-700",
  FURTHER_IMPROVEMENT_REQUIRED: "bg-orange-100 text-orange-700",
  MOVED_TO_SGA: "bg-purple-100 text-purple-700",
};

export const BENEFIT_CATEGORIES = ["Quality", "Cost", "Delivery", "Safety", "Morale", "Technology"];

export const KAIZEN_TRIGGERS: { value: KaizenTrigger; label: string }[] = [
  { value: "PROBLEM_NOTICED", label: "Problem noticed" },
  { value: "IMPROVEMENT_OPPORTUNITY_NOTICED", label: "Improvement opportunity noticed" },
  { value: "ALERT_ACTION_REQUIRED", label: "Action required from an alert" },
  { value: "ABNORMALITY_ACTION_REQUIRED", label: "Action required from an abnormality" },
  { value: "EMPLOYEE_SUGGESTION_OR_IDEA", label: "Employee suggestion or idea" },
  { value: "AUDIT_OR_GEMBA_WALK_OBSERVATION", label: "Audit or Gemba Walk observation" },
  { value: "CUSTOMER_COMPLAINT_OR_FEEDBACK", label: "Customer complaint or feedback" },
  { value: "MANAGEMENT_INSTRUCTION_OR_FEEDBACK", label: "Management instruction or feedback" },
  { value: "REPEAT_PROBLEM", label: "Repeat problem" },
  { value: "OTHER", label: "Other" },
];


export function StatusBadge({ status }: { status: KaizenStatus }) {
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function KpiCard({ label, value, icon, accent }: {
  label: string; value: string | number; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-lg sm:rounded-xl p-3 sm:p-5 shadow-sm">
      <div className={`h-7 w-7 sm:h-10 sm:w-10 rounded-md sm:rounded-lg flex items-center justify-center shrink-0 mb-1.5 sm:mb-3 ${accent}`}>
        <span className="scale-75 sm:scale-100">{icon}</span>
      </div>
      <p className="text-lg sm:text-2xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-[11px] sm:text-xs font-medium text-slate-500 mt-1 sm:mt-0.5 line-clamp-1">{label}</p>
    </div>
  );
}

export function Thumbnail({ src, alt }: { src: string | null | undefined; alt: string }) {
  if (!src) {
    return (
      <div className="h-14 w-14 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center">
        <ImageOff className="h-4 w-4 text-slate-300" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="h-14 w-14 shrink-0 rounded-lg object-cover bg-slate-100" />
  );
}

export function KaizenPagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`h-8 w-8 flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
            p === page ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-40 hover:bg-slate-50 transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

const WIZARD_STEPS = [
  { n: 1, label: "Create Kaizen" },
  { n: 2, label: "Update Improvement" },
  { n: 3, label: "Verify & Close" },
] as const;

export function KaizenStepper({ current, closed }: { current: 1 | 2 | 3; closed?: boolean }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-4 sm:px-6 py-4 overflow-x-auto">
      <div className="flex items-center min-w-max">
        {WIZARD_STEPS.map((step, i) => {
          const isDone = step.n < current || (closed === true && step.n <= current);
          const isActive = step.n === current && !isDone;
          return (
            <div key={step.n} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2 shrink-0">
                <div
                  className={`h-6 w-6 sm:h-7 sm:w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isActive
                      ? "bg-blue-600 text-white"
                      : "border-2 border-slate-200 text-slate-400"
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : step.n}
                </div>
                <span
                  className={`hidden sm:inline text-xs font-medium ${
                    isDone ? "text-emerald-600" : isActive ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-3 min-w-6 ${isDone ? "bg-emerald-300" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SectionLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-blue-600 pb-2 mb-4 border-b border-blue-100">
      {n}. {children}
    </h3>
  );
}

export function SummaryPanel({ title, rows, children }: {
  title: string;
  rows: { label: string; value: React.ReactNode }[];
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5 space-y-4 h-fit">
      <h3 className="text-sm font-semibold text-blue-600 pb-2 border-b border-blue-100">{title}</h3>
      <dl className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <dt className="text-xs text-slate-400 shrink-0">{r.label}</dt>
            <dd className="text-xs font-medium text-slate-700 text-right truncate">{r.value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  );
}

export function TipCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-2">
      <Lightbulb className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
      <p className="text-xs text-blue-700 leading-relaxed">{children}</p>
    </div>
  );
}
