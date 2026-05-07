"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lightbulb,
  CalendarClock,
  Receipt,
  FolderLock,
  BarChart3,
  GraduationCap,
  ShieldCheck,
  Package,
  Users,
  ArrowRight,
  Sparkles,
  ChevronRight,
  FileEdit,
  ListChecks,
  Building2,
} from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { AuthService } from "@/services/auth.service";
import DashboardHero from "@/components/DashboardHero";

// Module registry

type ModuleKey = "SIMS" | "TIME_ATTENDANCE" | "PAYROLL" | "DOCUMENTS" | "PERFORMANCE" | "LEARNING" | "COMPLIANCE" | "ASSETS";

interface ModuleConfig {
  key: ModuleKey;
  label: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  ring: string;
  href?: string;
  actions?: { label: string; href: string; icon: React.ElementType }[];
}

const MODULE_REGISTRY: Record<string, ModuleConfig> = {
  SIMS: {
    key: "SIMS",
    label: "SIMS",
    tagline: "Suggestions & Ideas",
    description: "Submit improvement ideas, track their progress, and collaborate on solutions that move the organization forward.",
    icon: Lightbulb,
    color: "text-amber-600",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
    href: "/sims",
    actions: [
      { label: "Submit an idea",    href: "/sims/new",            icon: FileEdit   },
      { label: "My submissions",    href: "/sims/my-suggestions", icon: ListChecks },
    ],
  },
};

// Upcoming

const UPCOMING_MODULES: Omit<ModuleConfig, "key" | "href" | "actions">[] = [
  {
    label: "Time & Attendance",
    tagline: "Shifts & Leave",
    description: "Log working hours, manage shift rosters, request leave, and get visibility into your attendance history.",
    icon: CalendarClock,
    color: "text-blue-600",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  {
    label: "Payroll & Finance",
    tagline: "Payslips & Expenses",
    description: "Access payslips, tax summaries, and expense claims — all in one secure place.",
    icon: Receipt,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  {
    label: "Document Center",
    tagline: "Contracts & Compliance",
    description: "Securely store, sign, and retrieve employment contracts, compliance documents, and policy files.",
    icon: FolderLock,
    color: "text-purple-600",
    bg: "bg-purple-50",
    ring: "ring-purple-200",
  },
  {
    label: "Performance Reviews",
    tagline: "Goals & Appraisals",
    description: "Set SMART goals, conduct structured appraisals, and track performance trends over time.",
    icon: BarChart3,
    color: "text-rose-600",
    bg: "bg-rose-50",
    ring: "ring-rose-200",
  },
  {
    label: "Learning & Development",
    tagline: "Courses & Certifications",
    description: "Assign training courses, track completion, and manage employee certifications and skill growth.",
    icon: GraduationCap,
    color: "text-sky-600",
    bg: "bg-sky-50",
    ring: "ring-sky-200",
  },
  {
    label: "Compliance & Safety",
    tagline: "Audits & Incidents",
    description: "Manage health & safety audits, incident reports, and regulatory compliance checklists.",
    icon: ShieldCheck,
    color: "text-teal-600",
    bg: "bg-teal-50",
    ring: "ring-teal-200",
  },
  {
    label: "Asset Management",
    tagline: "Equipment & Inventory",
    description: "Track company assets assigned to employees, manage maintenance schedules, and run inventory audits.",
    icon: Package,
    color: "text-orange-600",
    bg: "bg-orange-50",
    ring: "ring-orange-200",
  },
  {
    label: "HR & Onboarding",
    tagline: "People Operations",
    description: "Streamline new-hire onboarding, manage org structure, and keep employee records up to date.",
    icon: Users,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    ring: "ring-indigo-200",
  },
];


// Page

export default function DashboardPage() {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  useEffect(() => {
    if (!accessToken) return;
    AuthService.getMyOrg(accessToken)
      .then((org) => setActiveModules(org.modules ?? []))
      .catch(() => setActiveModules([]))
      .finally(() => setLoadingModules(false));
  }, [accessToken]);

  const enabledModules = activeModules
    .map((key) => MODULE_REGISTRY[key])
    .filter(Boolean);

  const upcomingToShow = UPCOMING_MODULES.filter(
    (m) => !activeModules.includes((m as any).key)
  );

  const canSeeExploreMore = ["SUPER_ADMIN", "ADMIN", "MANAGEMENT"].includes(user?.roleLevel ?? "");

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-16">

      <DashboardHero />

      {/* Active modules */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your Modules</h2>
            <p className="text-sm text-slate-500 mt-0.5">Features active for your organization</p>
          </div>
          {!loadingModules && enabledModules.length > 0 && (
            <span className="text-xs font-semibold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-100">
              {enabledModules.length} active
            </span>
          )}
        </div>

        {loadingModules && (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-8">
            <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            Loading modules...
          </div>
        )}

        {!loadingModules && enabledModules.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
            <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">No modules enabled yet</p>
            <p className="text-xs text-slate-400 mt-1">Contact your administrator to get started.</p>
          </div>
        )}

        {!loadingModules && enabledModules.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {enabledModules.map((mod) => (
              <div
                key={mod.key}
                onClick={() => router.push(mod.href!)}
                className={`group cursor-pointer h-full rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:ring-2 ${mod.ring} hover:border-transparent`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${mod.bg}`}>
                    <mod.icon className={`h-5 w-5 ${mod.color}`} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500 transition-colors mt-1" />
                </div>
                <p className="text-base font-bold text-slate-900">{mod.label}</p>
                <p className={`text-xs font-semibold mt-0.5 ${mod.color}`}>{mod.tagline}</p>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2">{mod.description}</p>

                {mod.actions && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">
                    {mod.actions.map((action) => (
                      <Link
                        key={action.href}
                        href={action.href}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                      >
                        <action.icon className="h-3.5 w-3.5 shrink-0" />
                        {action.label}
                        <ChevronRight className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Explore more */}
      {canSeeExploreMore && upcomingToShow.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-5">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <div>
              <h2 className="text-lg font-bold text-slate-900">Explore More</h2>
              <p className="text-sm text-slate-500 mt-0.5">More modules coming to the Gemba platform</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {upcomingToShow.map((mod) => (
              <div
                key={mod.label}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm opacity-80 hover:opacity-100 transition-opacity"
              >
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${mod.bg} mb-3`}>
                  <mod.icon className={`h-4 w-4 ${mod.color}`} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{mod.label}</p>
                    <p className={`text-[11px] font-semibold mt-0.5 ${mod.color}`}>{mod.tagline}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                    Soon
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed line-clamp-2">{mod.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
