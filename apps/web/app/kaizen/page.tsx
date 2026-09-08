"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { KaizenService, Kaizen, KaizenStatus } from "@/services/kaizen.service";
import { EmployeeService } from "@/services/employee.service";
import { StatusBadge, KpiCard, Thumbnail, KaizenPagination, STATUS_LABELS, formatDate } from "@/components/kaizen/kaizen-ui";
import { Plus, Lightbulb, Loader2, ShieldCheck, CheckCircle2, Search, X } from "lucide-react";

type TabKey = "mine" | "department" | "verification";

const PAGE_SIZE = 10;

function KaizenRow({ k, showOwner }: { k: Kaizen; showOwner?: boolean }) {
  const title = k.title || k.conditionDescription;
  return (
    <Link
      href={`/kaizen/${k.id}`}
      className="flex items-center gap-3 px-4 py-3 sm:px-6 hover:bg-slate-50 transition-colors"
    >
      <Thumbnail src={k.conditionEvidenceUrls[0]} alt={title} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
        <p className="text-xs text-slate-500 mt-1">
          {showOwner && `${k.employee.firstName} ${k.employee.lastName} · `}
          {k.department?.name ?? "No department"} · {formatDate(k.createdAt)}
        </p>
      </div>
      <StatusBadge status={k.status} />
    </Link>
  );
}

function KaizenListCard({ kaizens, isLoading, emptyText, showOwner }: {
  kaizens: Kaizen[]; isLoading: boolean; emptyText: string; showOwner?: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-slate-400 py-10 text-center flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>;
  }
  if (kaizens.length === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm py-16 text-center">
        <p className="text-sm font-semibold text-slate-600">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-sm divide-y divide-slate-50">
      {kaizens.map((k) => <KaizenRow key={k.id} k={k} showOwner={showOwner} />)}
    </div>
  );
}

export default function KaizenOverviewPage() {
  const { user, accessToken } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<KaizenStatus | "ALL">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const role = user?.roleLevel;
  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const canSeeDepartment = !!user?.departmentId;

  const { data: mine = [], isLoading: mineLoading } = useQuery({
    queryKey: ["kaizen-my"],
    queryFn: () => KaizenService.getMine(accessToken!),
    enabled: !!accessToken,
  });

  const { data: department = [], isLoading: departmentLoading } = useQuery({
    queryKey: ["kaizen-department", user?.departmentId],
    queryFn: () => KaizenService.getByDepartment(user!.departmentId!, accessToken!),
    enabled: !!accessToken && !!user?.departmentId && !isPrivileged,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.organizationId],
    queryFn: () => EmployeeService.getDepartments(user!.organizationId!, accessToken!),
    enabled: !!accessToken && !!user?.organizationId && isPrivileged,
  });

  const { data: pendingVerification = [], isLoading: pendingVerificationLoading } = useQuery({
    queryKey: ["kaizen-pending-verification"],
    queryFn: () => KaizenService.getPendingVerification(accessToken!),
    enabled: !!accessToken,
  });

  const now = new Date();
  const inImplementationCount = mine.filter((k) => k.status === "IN_IMPLEMENTATION").length;
  const pendingMyVerificationCount = pendingVerification.length;
  const verifiedThisMonthCount = mine.filter(
    (k) => k.status === "VERIFIED_CLOSED" &&
      new Date(k.updatedAt).getMonth() === now.getMonth() &&
      new Date(k.updatedAt).getFullYear() === now.getFullYear(),
  ).length;

  const TABS: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "mine", label: "My Kaizens", visible: true },
    { key: "department", label: "My Department", visible: canSeeDepartment && !isPrivileged },
    { key: "verification", label: "Pending My Review", visible: true },
  ];

  const showDepartmentFilter = tab === "verification" && isPrivileged;

  const activeList = tab === "mine" ? mine : tab === "department" ? department : pendingVerification;
  const activeLoading = tab === "mine" ? mineLoading : tab === "department" ? departmentLoading : pendingVerificationLoading;
  const emptyText = tab === "mine"
    ? "No kaizens yet. Raise your first one."
    : tab === "department"
    ? "No kaizens in your department yet."
    : "Nothing awaiting your review.";

  const filtered = useMemo(() => {
    return activeList.filter((k) => {
      if (search && !(k.title || k.conditionDescription).toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "ALL" && k.status !== statusFilter) return false;
      if (showDepartmentFilter && departmentFilter !== "ALL" && k.department?.id !== departmentFilter) return false;
      return true;
    });
  }, [activeList, search, statusFilter, departmentFilter, showDepartmentFilter]);

  const hasFilters = !!search || statusFilter !== "ALL" || (showDepartmentFilter && departmentFilter !== "ALL");

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab, search, statusFilter, departmentFilter]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
  };

  return (
    <ProtectedRoute
      allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}
    >
      <div className="mx-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-slate-900">Daily Gemba Kaizen</h1>
          <Link
            href="/kaizen/new"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New Kaizen
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="My Kaizens" value={mine.length} icon={<Lightbulb className="h-4 w-4 text-blue-600" />} accent="bg-blue-50" />
          <KpiCard label="In Implementation" value={inImplementationCount} icon={<Loader2 className="h-4 w-4 text-amber-600" />} accent="bg-amber-50" />
          <KpiCard label="Pending My Review" value={pendingMyVerificationCount} icon={<ShieldCheck className="h-4 w-4 text-purple-600" />} accent="bg-purple-50" />
          <KpiCard label="Verified This Month" value={verifiedThisMonthCount} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} accent="bg-emerald-50" />
        </div>

        <div className="flex items-center gap-1 border-b border-slate-200">
          {TABS.filter((t) => t.visible).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-45">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title..."
              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as KaizenStatus | "ALL")}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
          >
            <option value="ALL">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          {showDepartmentFilter && (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-2"
            >
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </button>
          )}
        </div>

        <KaizenListCard
          kaizens={pageItems}
          isLoading={activeLoading}
          emptyText={emptyText}
          showOwner={tab !== "mine"}
        />

        <KaizenPagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </ProtectedRoute>
  );
}
