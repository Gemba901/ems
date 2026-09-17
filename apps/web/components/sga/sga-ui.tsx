import { TenantImage } from "@/components/files/TenantImage";
import {
  SgaStatus,
  SgaStartingReason,
  SgaReferenceApplicability,
  SgaQcdsmtCategory,
  SgaUnit,
  SgaWaste,
  SgaHodDecision,
  SgaMeetingFrequency,
  SgaWeekday,
  SgaRootCauseTool,
  SgaFishboneCategory,
  SgaImplementationStatus,
  SgaVerificationStage,
  SgaVerificationDecision,
  SgaBenefitPeriod,
} from "@/services/sga.service";
import { ChevronLeft, ChevronRight, ImageOff, Check, Lightbulb, Lock } from "lucide-react";

export const STATUS_LABELS: Record<SgaStatus, string> = {
  DRAFT: "Draft",
  PENDING_HOD_APPROVAL: "Pending HOD Approval",
  RETURNED_FOR_REVISION: "Returned for Revision",
  REJECTED: "Rejected",
  IN_PROGRESS: "In Progress",
  PENDING_VERIFICATION: "Pending Verification",
  RETURNED_FOR_REWORK: "Returned for Rework",
  VERIFIED_CLOSED: "Verified & Closed",
};

export const STATUS_BADGE: Record<SgaStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PENDING_HOD_APPROVAL: "bg-amber-100 text-amber-700",
  RETURNED_FOR_REVISION: "bg-orange-100 text-orange-700",
  REJECTED: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  PENDING_VERIFICATION: "bg-amber-100 text-amber-700",
  RETURNED_FOR_REWORK: "bg-orange-100 text-orange-700",
  VERIFIED_CLOSED: "bg-emerald-100 text-emerald-700",
};

export const STARTING_REASONS: { value: SgaStartingReason; label: string }[] = [
  { value: "QUALITY_PROBLEM_OR_IMPROVEMENT", label: "Quality problem or improvement" },
  { value: "COST_REDUCTION_OR_FINANCIAL_LOSS", label: "Cost reduction or financial loss" },
  { value: "DELIVERY_DELAY_OR_PROCESS_FLOW", label: "Delivery delay or process flow" },
  { value: "SAFETY_OR_ENVIRONMENTAL_IMPROVEMENT", label: "Safety or environmental improvement" },
  { value: "PRODUCTIVITY_OR_CAPACITY_IMPROVEMENT", label: "Productivity or capacity improvement" },
  { value: "MORALE_TEAMWORK_OR_WORK_DIFFICULTY", label: "Morale, teamwork or work difficulty" },
  { value: "TECHNOLOGY_OR_AUTOMATION_IMPROVEMENT", label: "Technology or automation improvement" },
  { value: "SYSTEMS_INFORMATION_OR_DATA_REPORTING_IMPROVEMENT", label: "Systems, information or data reporting improvement" },
  { value: "INVENTORY_OR_WIP_REDUCTION", label: "Inventory or WIP reduction" },
  { value: "MACHINE_BREAKDOWN_OR_EQUIPMENT_PERFORMANCE", label: "Machine breakdown or equipment performance" },
  { value: "SMED_CHANGEOVER_TIME_REDUCTION", label: "SMED / changeover time reduction" },
  { value: "EXTERNAL_CUSTOMER_REQUIREMENT_OR_COMPLAINT", label: "External customer requirement or complaint" },
  { value: "INTERNAL_CUSTOMER_OR_CROSS_FUNCTIONAL_REQUIREMENT", label: "Internal customer or cross-functional requirement" },
  { value: "ALERT_OR_ABNORMALITY_REQUIRING_TEAM_PROJECT", label: "Alert or abnormality requiring a team project" },
  { value: "AUDIT_FINDING_OR_GEMBA_WALK_OBSERVATION", label: "Audit finding or Gemba walk observation" },
  { value: "MANAGEMENT_IMPROVEMENT_PRIORITY", label: "Management improvement priority" },
  { value: "DAILY_KAIZEN_UPGRADED_TO_SGA", label: "Daily Kaizen upgraded to SGA" },
  { value: "OTHER", label: "Other" },
];

export const REFERENCE_APPLICABILITY_LABELS: Record<SgaReferenceApplicability, string> = {
  APPLICABLE: "Applicable",
  NOT_APPLICABLE: "Not applicable",
  REFERENCE_NOT_FOUND: "Reference not found",
};

export const QCDSMT_CATEGORIES: { value: SgaQcdsmtCategory; label: string }[] = [
  { value: "QUALITY", label: "Quality" },
  { value: "COST", label: "Cost" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "SAFETY", label: "Safety" },
  { value: "MORALE", label: "Morale" },
  { value: "TECHNOLOGY", label: "Technology" },
];

export const QCDSMT_LABELS: Record<SgaQcdsmtCategory, string> = {
  QUALITY: "Quality",
  COST: "Cost",
  DELIVERY: "Delivery",
  SAFETY: "Safety",
  MORALE: "Morale",
  TECHNOLOGY: "Technology",
};

export const UNIT_OPTIONS: { value: SgaUnit; label: string }[] = [
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

export const UNIT_LABELS: Record<SgaUnit, string> = {
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

export const WASTE_OPTIONS: { value: SgaWaste; label: string }[] = [
  { value: "TRANSPORTATION", label: "Transportation" },
  { value: "INVENTORY", label: "Inventory" },
  { value: "MOTION", label: "Motion" },
  { value: "WAITING", label: "Waiting" },
  { value: "OVERPRODUCTION", label: "Overproduction" },
  { value: "OVERPROCESSING", label: "Overprocessing" },
  { value: "DEFECTS", label: "Defects" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

export const WASTE_LABELS: Record<SgaWaste, string> = {
  TRANSPORTATION: "Transportation",
  INVENTORY: "Inventory",
  MOTION: "Motion",
  WAITING: "Waiting",
  OVERPRODUCTION: "Overproduction",
  OVERPROCESSING: "Overprocessing",
  DEFECTS: "Defects",
  NOT_APPLICABLE: "Not applicable",
};

export const HOD_DECISION_LABELS: Record<SgaHodDecision, string> = {
  PENDING: "Pending decision",
  APPROVED: "Approved",
  RETURNED: "Returned",
  REJECTED: "Rejected",
};

export const HOD_DECISION_BADGE: Record<SgaHodDecision, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  RETURNED: "bg-orange-100 text-orange-700",
  REJECTED: "bg-red-100 text-red-700",
};

export const MEETING_FREQUENCY_LABELS: Record<SgaMeetingFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
};

export const WEEKDAY_OPTIONS: { value: SgaWeekday; label: string }[] = [
  { value: "MONDAY", label: "Monday" },
  { value: "TUESDAY", label: "Tuesday" },
  { value: "WEDNESDAY", label: "Wednesday" },
  { value: "THURSDAY", label: "Thursday" },
  { value: "FRIDAY", label: "Friday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

export const WEEKDAY_LABELS: Record<SgaWeekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export const ROOT_CAUSE_TOOL_OPTIONS: { value: SgaRootCauseTool; label: string }[] = [
  { value: "FISHBONE_5M", label: "Fishbone (5M)" },
  { value: "WHY_WHY", label: "Why-Why analysis" },
  { value: "PARETO", label: "Pareto analysis" },
  { value: "PROCESS_OBSERVATION", label: "Process observation" },
  { value: "DATA_TREND", label: "Data trend analysis" },
  { value: "OTHER", label: "Other" },
];

export const ROOT_CAUSE_TOOL_LABELS: Record<SgaRootCauseTool, string> = {
  FISHBONE_5M: "Fishbone (5M)",
  WHY_WHY: "Why-Why analysis",
  PARETO: "Pareto analysis",
  PROCESS_OBSERVATION: "Process observation",
  DATA_TREND: "Data trend analysis",
  OTHER: "Other",
};

export const FISHBONE_CATEGORIES: { value: SgaFishboneCategory; label: string }[] = [
  { value: "PEOPLE", label: "People" },
  { value: "MACHINE", label: "Machine" },
  { value: "MATERIAL", label: "Material" },
  { value: "METHOD", label: "Method" },
  { value: "MEASUREMENT", label: "Measurement" },
  { value: "ENVIRONMENT_OTHER", label: "Environment / Other" },
];

export const FISHBONE_CATEGORY_LABELS: Record<SgaFishboneCategory, string> = {
  PEOPLE: "People",
  MACHINE: "Machine",
  MATERIAL: "Material",
  METHOD: "Method",
  MEASUREMENT: "Measurement",
  ENVIRONMENT_OTHER: "Environment / Other",
};

export const IMPLEMENTATION_STATUS_OPTIONS: { value: SgaImplementationStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ON_HOLD", label: "On hold" },
];

export const IMPLEMENTATION_STATUS_LABELS: Record<SgaImplementationStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
};

export const BENEFIT_PERIOD_OPTIONS: { value: SgaBenefitPeriod; label: string }[] = [
  { value: "PER_DAY", label: "Per day" },
  { value: "PER_WEEK", label: "Per week" },
  { value: "PER_MONTH", label: "Per month" },
  { value: "PER_YEAR", label: "Per year" },
  { value: "ONE_TIME", label: "One-time" },
];

export const BENEFIT_PERIOD_LABELS: Record<SgaBenefitPeriod, string> = {
  PER_DAY: "Per day",
  PER_WEEK: "Per week",
  PER_MONTH: "Per month",
  PER_YEAR: "Per year",
  ONE_TIME: "One-time",
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

export const VERIFICATION_STAGE_LABELS: Record<SgaVerificationStage, string> = {
  AFFECTED_DEPARTMENT: "Affected Department",
  HOD: "Department HOD",
  STEERING_COMMITTEE: "Steering Committee",
  FINANCE: "Finance",
};

export const VERIFICATION_DECISION_LABELS: Record<SgaVerificationDecision, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  RETURN: "Returned",
  NOT_APPLICABLE: "Not applicable",
};

export const VERIFICATION_DECISION_BADGE: Record<SgaVerificationDecision, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-emerald-100 text-emerald-700",
  RETURN: "bg-orange-100 text-orange-700",
  NOT_APPLICABLE: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: SgaStatus }) {
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
    <TenantImage src={src} alt={alt} className="h-14 w-14 shrink-0 rounded-lg object-cover bg-slate-100" />
  );
}

export function SgaPagination({ page, totalPages, onChange }: {
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

export const SGA_STAGES = [
  { key: "start", label: "Start" },
  { key: "team", label: "Team & Approve" },
  { key: "analyse", label: "Understand & Analyse" },
  { key: "implement", label: "Plan & Implement" },
  { key: "check", label: "Check Results" },
  { key: "verify", label: "Verify & Close" },
] as const;

export type SgaStageKey = (typeof SGA_STAGES)[number]["key"];
export type SgaStageState = "done" | "active" | "returned" | "locked";

export function SgaProgress({ states }: { states: Record<SgaStageKey, SgaStageState> }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm px-3 sm:px-6 py-4 overflow-x-auto no-scrollbar">
      <div className="flex items-center w-full">
        {SGA_STAGES.map((stage, i) => {
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
              {i < SGA_STAGES.length - 1 && (
                <div className={`flex-1 h-px mx-1.5 sm:mx-2 min-w-2 ${isDone ? "bg-emerald-300" : "bg-slate-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LockedSection({ n, label }: { n: number | string; label: string }) {
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

export function SectionLabel({ n, children }: { n: number | string; children: React.ReactNode }) {
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
