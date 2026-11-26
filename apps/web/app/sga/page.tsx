"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { useAuthStore } from "@/store/auth.store";
import { SgaService, Sga, SgaStatus } from "@/services/sga.service";
import { EmployeeService } from "@/services/employee.service";
import { SgaPagination, STATUS_LABELS, formatDate } from "@/components/sga/sga-ui";
import { EmptyState } from "@/components/patterns/EmptyState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { StatCard } from "@/components/patterns/StatCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { statusBadgeClass } from "@/lib/status";
import { CoverCard, CoverCardGrid } from "@/components/ui/CoverCard";
import { Plus, Users2, Loader2, ShieldCheck, CheckCircle2, Search, X } from "lucide-react";

type TabKey = "mine" | "department" | "verification";

const PAGE_SIZE = 12;

const RAISER_EDITABLE_STATUSES: SgaStatus[] = ["DRAFT", "RETURNED_FOR_REVISION"];

function SgaCard({ s, showOwner, myEmployeeId }: { s: Sga; showOwner?: boolean; myEmployeeId?: string }) {
  const title = s.title || s.problemDescription || "Untitled SGA";
  const canContinue = !!myEmployeeId && s.employeeId === myEmployeeId && RAISER_EDITABLE_STATUSES.includes(s.status);
  return (
    <CoverCard
      href={`/sga/${s.id}`}
      title={title}
      meta={`${showOwner ? `${s.employee.firstName} ${s.employee.lastName} · ` : ""}${s.mainDepartment?.name ?? "No department"} · ${formatDate(s.createdAt)}`}
      coverSrc={s.beforeFileUrls[0]}
      coverIcon={<Users2 />}
      tone={statusBadgeClass(s.status)}
      statusLabel={STATUS_LABELS[s.status]}
      cta={canContinue ? (s.status === "DRAFT" ? "Continue draft" : "Update & resubmit") : undefined}
    />
  );
}

function SgaListCard({ sgas, isLoading, emptyText, showOwner, myEmployeeId }: {
  sgas: Sga[]; isLoading: boolean; emptyText: string; showOwner?: boolean; myEmployeeId?: string;
}) {
  if (isLoading) return <LoadingState label="Loading SGAs…" />;
  if (sgas.length === 0) return <EmptyState title={emptyText} />;
  return (
    <CoverCardGrid>
      {sgas.map((s) => <SgaCard key={s.id} s={s} showOwner={showOwner} myEmployeeId={myEmployeeId} />)}
    </CoverCardGrid>
  );
}

export default function SgaOverviewPage() {
  const { user, accessToken } = useAuthStore();
  const [tab, setTab] = useState<TabKey>("mine");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SgaStatus | "ALL">("ALL");
  const [departmentFilter, setDepartmentFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const role = user?.roleLevel;
  const isPrivileged = role === Role.SUPER_ADMIN || role === Role.ADMIN || role === Role.MANAGEMENT;
  const canSeeDepartment = !!user?.departmentId;

  const { data: me } = useQuery({
    queryKey: ["employee-me"],
    queryFn: () => EmployeeService.getMe(accessToken!),
    enabled: !!accessToken,
  });

  const { data: mine = [], isLoading: mineLoading } = useQuery({
    queryKey: ["sga-my"],
    queryFn: () => SgaService.getMine(accessToken!),
    enabled: !!accessToken,
  });

  const { data: department = [], isLoading: departmentLoading } = useQuery({
    queryKey: ["sga-department", user?.departmentId],
    queryFn: () => SgaService.getByDepartment(user!.departmentId!, accessToken!),
    enabled: !!accessToken && !!user?.departmentId && !isPrivileged,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments", user?.organizationId],
    queryFn: () => EmployeeService.getDepartments(user!.organizationId!, accessToken!),
    enabled: !!accessToken && !!user?.organizationId && isPrivileged,
  });

  const { data: pendingVerification = [], isLoading: pendingVerificationLoading } = useQuery({
    queryKey: ["sga-pending-verification"],
    queryFn: () => SgaService.getPendingVerification(accessToken!),
    enabled: !!accessToken,
  });

  const now = new Date();
  const inProgressCount = mine.filter((s) => s.status === "IN_PROGRESS").length;
  const pendingMyVerificationCount = pendingVerification.length;
  const verifiedThisMonthCount = mine.filter(
    (s) => s.status === "VERIFIED_CLOSED" &&
      new Date(s.updatedAt).getMonth() === now.getMonth() &&
      new Date(s.updatedAt).getFullYear() === now.getFullYear(),
  ).length;

  const TABS: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "mine", label: "My SGAs", visible: true },
    { key: "department", label: "My Department", visible: canSeeDepartment && !isPrivileged },
    { key: "verification", label: "Pending My Review", visible: true },
  ];

  const showDepartmentFilter = tab === "verification" && isPrivileged;

  const activeList = tab === "mine" ? mine : tab === "department" ? department : pendingVerification;
  const activeLoading = tab === "mine" ? mineLoading : tab === "department" ? departmentLoading : pendingVerificationLoading;
  const emptyText = tab === "mine"
    ? "No SGAs yet. Raise your first one."
    : tab === "department"
    ? "No SGAs in your department yet."
    : "Nothing awaiting your review.";

  const filtered = useMemo(() => {
    return activeList.filter((s) => {
      const title = s.title || s.problemDescription || "";
      if (search && !title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (showDepartmentFilter && departmentFilter !== "ALL" && s.mainDepartment?.id !== departmentFilter) return false;
      return true;
    });
  }, [activeList, search, statusFilter, departmentFilter, showDepartmentFilter]);

  const hasFilters = !!search || statusFilter !== "ALL" || (showDepartmentFilter && departmentFilter !== "ALL");

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const clearFilters = () => {
    setPage(1);
    setSearch("");
    setStatusFilter("ALL");
    setDepartmentFilter("ALL");
  };

  return (
    <ProtectedRoute
      allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD, Role.HR, Role.EMPLOYEE]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Small Group Activities"
          actions={
            <Link href="/sga/new" className={buttonVariants()}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              New SGA
            </Link>
          }
        />

        <div data-tour="overview-kpis" className="grid grid-cols-2 gap-control sm:grid-cols-4">
          <StatCard label="My SGAs" value={mine.length} icon={<Users2 />} />
          <StatCard label="In Progress" value={inProgressCount} icon={<Loader2 className="text-warning" />} />
          <StatCard label="Pending My Review" value={pendingMyVerificationCount} icon={<ShieldCheck className="text-info" />} />
          <StatCard label="Verified This Month" value={verifiedThisMonthCount} icon={<CheckCircle2 className="text-success" />} />
        </div>

        <div data-tour="overview-tabs" role="group" aria-label="SGA views" className="flex flex-wrap gap-control border-b border-border pb-3">
          {TABS.filter((item) => item.visible).map((item) => (
            <Button
              key={item.key}
              type="button"
              variant={tab === item.key ? "default" : "ghost"}
              aria-pressed={tab === item.key}
              onClick={() => {
                setTab(item.key);
                setPage(1);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-control">
          <div className="relative min-w-45 flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search SGAs by title"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by title…"
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            items={{ ALL: "All statuses", ...STATUS_LABELS }}
            onValueChange={(value) => {
              if (value === null) return;
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="SGA status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showDepartmentFilter && (
            <Select
              value={departmentFilter}
              items={[{ value: "ALL", label: "All departments" }, ...departments.map(({ id, name }) => ({ value: id, label: name }))]}
              onValueChange={(value) => {
                if (value === null) return;
                setDepartmentFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Department"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All departments</SelectItem>
                {departments.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={clearFilters}>
              <X aria-hidden="true" data-icon="inline-start" />
              Clear filters
            </Button>
          )}
        </div>

        <SgaListCard
          sgas={pageItems}
          isLoading={activeLoading}
          emptyText={hasFilters ? "No SGAs match your filters." : emptyText}
          showOwner={tab !== "mine"}
          myEmployeeId={me?.id}
        />

        <SgaPagination page={currentPage} totalPages={totalPages} onChange={setPage} />
      </div>
    </ProtectedRoute>
  );
}
