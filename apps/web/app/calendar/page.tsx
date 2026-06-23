"use client";

import { useState } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { type CalendarTabType, EventsCalendarTab } from "@/components/calendar/EventsCalendarTab";
import { ConsultancyCalendarTab } from "@/components/calendar/ConsultancyCalendarTab";
import { Calendar, User, Briefcase, BookOpen } from "lucide-react";

type MainTab = CalendarTabType | "consultancy";

const MAIN_TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
  { key: "personal",    label: "Personal",           icon: <User      className="h-3.5 w-3.5" /> },
  { key: "company",     label: "Company",            icon: <Briefcase className="h-3.5 w-3.5" /> },
  { key: "training",    label: "Training",           icon: <BookOpen  className="h-3.5 w-3.5" /> },
  { key: "consultancy", label: "Consultancy Visits", icon: <Calendar  className="h-3.5 w-3.5" /> },
];

const ALL_ROLES = [
  Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT,
  Role.HR, Role.HOD, Role.EMPLOYEE,
];

export default function CalendarPage() {
  const { accessToken, user } = useAuthStore();
  const isAdmin = user?.isAdminOrg === true;

  const [mainTab, setMainTab] = useState<MainTab>("personal");

  return (
    <ProtectedRoute allowedRoles={ALL_ROLES}>
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendar</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your schedule, meetings, company events, and training
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0.5 border-b border-slate-200 overflow-x-auto overflow-y-hidden scrollbar-none -mx-4 px-4 md:-mx-6 md:px-6">
          {MAIN_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px whitespace-nowrap shrink-0 ${
                mainTab === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {tab.icon}
              {tab.key === "consultancy" && isAdmin ? "Client Visit Plan" : tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {mainTab !== "consultancy" && (
          <EventsCalendarTab tab={mainTab} />
        )}

        {mainTab === "consultancy" && accessToken && (
          <ConsultancyCalendarTab accessToken={accessToken} isAdmin={isAdmin} />
        )}

      </div>
    </ProtectedRoute>
  );
}
