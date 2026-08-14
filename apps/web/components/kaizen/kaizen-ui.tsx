import {
  KaizenStatus,
  KaizenTrigger,
  KaizenQcdsmtCategory,
  KaizenUnit,
  KaizenWaste,
  KaizenReferenceApplicability,
  KaizenHodPreReviewDecision,
  KaizenVerificationStage,
  KaizenVerificationDecision,
} from "@/services/kaizen.service";
import { ChevronLeft, ChevronRight, ImageOff, Check, Lightbulb, Lock } from "lucide-react";

export const STATUS_LABELS: Record<KaizenStatus, string> = {
  DRAFT: "Draft",
  PENDING_HOD_PRE_REVIEW: "Pending HOD Pre-Review",
  RETURNED_FOR_REVISION: "Returned for Revision",
  REJECTED: "Rejected",
  MOVED_TO_SGA: "Moved to SGA",
  IN_IMPLEMENTATION: "In Implementation",
  PENDING_VERIFICATION: "Pending Verification",
  RETURNED_FOR_REWORK: "Returned for Rework",
  VERIFIED_CLOSED: "Verified & Closed",
};

export const STATUS_BADGE: Record<KaizenStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PENDING_HOD_PRE_REVIEW: "bg-amber-100 text-amber-700",
  RETURNED_FOR_REVISION: "bg-orange-100 text-orange-700",
  REJECTED: "bg-red-100 text-red-700",
  MOVED_TO_SGA: "bg-purple-100 text-purple-700",
  IN_IMPLEMENTATION: "bg-blue-100 text-blue-700",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
  RETURNED_FOR_REWORK: "bg-orange-100 text-orange-700",
  VERIFIED_CLOSED: "bg-emerald-100 text-emerald-700",
};

export const KAIZEN_TRIGGERS: { value: KaizenTrigger; label: string }[] = [
  { value: "PROBLEM_NOTICED", label: "Problem noticed" },
  { value: "IMPROVEMENT_OPPORTUNITY_NOTICED", label: "Improvement opportunity noticed" },
  { value: "ALERT_ACTION_REQUIRED", label: "Action required from an alert" },
  { value: "ABNORMALITY_ACTION_REQUIRED", label: "Action required from an abnormality" },
  { value: "EMPLOYEE_SUGGESTION_OR_IDEA", label: "Employee suggestion or idea" },
  { value: "AUDIT_OBSERVATION", label: "Audit observation" },
  { value: "GEMBA_WALK_OBSERVATION", label: "Gemba walk observation" },
  { value: "CUSTOMER_COMPLAINT_OR_FEEDBACK", label: "Customer complaint or feedback" },
  { value: "MANAGEMENT_INSTRUCTION_OR_FEEDBACK", label: "Management instruction or feedback" },
  { value: "REPEAT_PROBLEM", label: "Repeat problem" },
  { value: "OTHER", label: "Other" },
];

export const REFERENCE_APPLICABILITY_LABELS: Record<KaizenReferenceApplicability, string> = {
  APPLICABLE: "Applicable",
  NOT_APPLICABLE: "Not applicable",
  REFERENCE_NOT_FOUND: "Reference not found",
};

export const QCDSMT_CATEGORIES: { value: KaizenQcdsmtCategory; label: string }[] = [
  { value: "QUALITY", label: "Quality" },
  { value: "COST", label: "Cost" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "SAFETY", label: "Safety" },
  { value: "MORALE", label: "Morale" },
  { value: "TECHNOLOGY", label: "Technology" },
];

export const QCDSMT_LABELS: Record<KaizenQcdsmtCategory, string> = {
  QUALITY: "Quality",
  COST: "Cost",
  DELIVERY: "Delivery",
  SAFETY: "Safety",
  MORALE: "Morale",
  TECHNOLOGY: "Technology",
};

export const UNIT_OPTIONS: { value: KaizenUnit; label: string }[] = [
  { value: "SECONDS", label: "Seconds" },
  { value: "HOURS", label: "Hours" },
  { value: "MINUTES", label: "Minutes" },
  { value: "PIECES", label: "Pieces" },
  { value: "KILOGRAMS", label: "Kilograms" },
  { value: "TONNES", label: "Tonnes" },
  { value: "METRES", label: "Metres" },
  { value: "LITRES", label: "Litres" },
  { value: "PERCENTAGE", label: "Percentage" },
  { value: "CURRENCY", label: "Currency" },
  { value: "OTHER", label: "Other" },
];

export const UNIT_LABELS: Record<KaizenUnit, string> = {
  SECONDS: "Seconds",
  HOURS: "Hours",
  MINUTES: "Minutes",
  PIECES: "Pieces",
  KILOGRAMS: "Kilograms",
  TONNES: "Tonnes",
  METRES: "Metres",
  LITRES: "Litres",
  PERCENTAGE: "Percentage",
  CURRENCY: "Currency",
  OTHER: "Other",
};

export const WASTE_OPTIONS: { value: KaizenWaste; label: string }[] = [
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "INVENTORY", label: "Inventory" },
  { value: "MOTION", label: "Motion" },
  { value: "WAITING", label: "Waiting" },
  { value: "OVERPRODUCTION", label: "Overproduction" },
  { value: "OVERPROCESSING", label: "Overprocessing" },
  { value: "DEFECTS", label: "Defects" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

export const WASTE_LABELS: Record<KaizenWaste, string> = {
  TRANSPORTATION: "Transportation",
  INVENTORY: "Inventory",
  MOTION: "Motion",
  WAITING: "Waiting",
  OVERPRODUCTION: "Overproduction",
  OVERPROCESSING: "Overprocessing",
  DEFECTS: "Defects",
  NOT_APPLICABLE: "Not applicable",
};

const FALLBACK_CURRENCIES = ["KES", "USD", "EUR", "GBP", "UGX", "TZS", "RWF", "ZAR", "NGN"];

function buildCurrencyCodes(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("currency");
    if (supported?.length) return supported;
  } catch {
    // Intl.supportedValuesOf unsupported in this environment
  }
  return FALLBACK_CURRENCIES;
}

function currencyLabel(code: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "currency" });
    const name = names.of(code);
    return name && name !== code ? `${code} - ${name}` : code;
  } catch {
    return code;
  }
}

export const CURRENCY_OPTIONS: { value: string; label: string }[] = buildCurrencyCodes()
  .map((code) => ({ value: code, label: currencyLabel(code) }))
  .sort((a, b) => a.value.localeCompare(b.value));

export function CurrencySelect({ value, onChange, disabled, className }: {
  value: string | undefined | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400 ${className ?? ""}`}
    >
      <option value="">Currency</option>
      {CURRENCY_OPTIONS.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  );
}

export const HOD_PRE_REVIEW_LABELS: Record<KaizenHodPreReviewDecision, string> = {
  PENDING: "Pending review",
  APPROVE: "Approved",
  RETURN: "Returned",
  REJECT: "Rejected",
  MOVE_TO_SGA: "Moved to SGA",
};

export const VERIFICATION_STAGE_LABELS: Record<KaizenVerificationStage, string> = {
  HOD: "Department HOD",
  STEERING_COMMITTEE: "Steering Committee",
  FINANCE: "Finance",
};

export const VERIFICATION_DECISION_LABELS: Record<KaizenVerificationDecision, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  RETURN: "Returned",
  NOT_APPLICABLE: "Not applicable",
};

export const VERIFICATION_DECISION_BADGE: Record<KaizenVerificationDecision, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-emerald-100 text-emerald-700",
  RETURN: "bg-orange-100 text-orange-700",
  NOT_APPLICABLE: "bg-slate-100 text-slate-500",
};


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

export const KAIZEN_STAGES = [
  { key: "create", label: "Create" },
  { key: "hod", label: "HOD Review" },
  { key: "implement", label: "Implement" },
  { key: "verify", label: "Verify" },
  { key: "close", label: "Close" },
] as const;

export type KaizenStageKey = (typeof KAIZEN_STAGES)[number]["key"];
export type KaizenStageState = "done" | "active" | "returned" | "locked";

export function KaizenProgress({ states }: { states: Record<KaizenStageKey, KaizenStageState> }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-3 sm:px-6 py-4 overflow-x-auto no-scrollbar">
      <div className="flex items-center w-full">
        {KAIZEN_STAGES.map((stage, i) => {
          const state = states[stage.key] ?? "locked";
          const isDone = state === "done";
          const isActive = state === "active";
          const isReturned = state === "returned";
          return (
            <div key={stage.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                <div
                  className={`h-6 w-6 sm:h-7 sm:w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    isDone
                      ? "bg-emerald-500 text-white"
                      : isActive
                      ? "bg-blue-600 text-white"
                      : isReturned
                      ? "bg-orange-500 text-white"
                      : "border-2 border-slate-200 text-slate-400"
                  }`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <span
                  className={`hidden lg:inline text-xs font-medium whitespace-nowrap ${
                    isDone ? "text-emerald-600" : isActive ? "text-blue-600" : isReturned ? "text-orange-600" : "text-slate-400"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              {i < KAIZEN_STAGES.length - 1 && (
                <div className={`flex-1 h-px mx-1.5 sm:mx-2 min-w-2 ${isDone ? "bg-emerald-300" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LockedSection({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-5 flex items-center gap-3 text-slate-400">
      <div className="h-8 w-8 rounded-full border-2 border-slate-200 flex items-center justify-center shrink-0">
        <Lock className="h-3.5 w-3.5" />
      </div>
      <p className="text-sm font-medium">
        {n}. {label} - locked until earlier sections are complete
      </p>
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
