"use client";

import React, { useCallback, useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuthStore } from '@/store/auth.store';
import {
  DwmsService,
  type DwmsAccessCapabilities,
  type DwmsDashboardTrendPoint,
  type DwmsDepartmentDashboardResponse,
  type DwmsEmployeeDashboardResponse,
  type DwmsOverviewDashboardResponse,
} from '@/services/dwms.service';

// Imported modular components
import KpiCards from '../components/dashboard/KpiCards';
import SVGLineChart from '../components/dashboard/SVGLineChart';
import OverviewDashboard from '../components/dashboard/OverviewDashboard';
import DepartmentDashboard from '../components/dashboard/DepartmentDashboard';
import EmployeeDashboard from '../components/dashboard/EmployeeDashboard';
import EmployeeDwmsPanel from '../components/EmployeeDwmsPanel';
import DwmsTabHeader from '../components/DwmsTabHeader';
import DwmsSelectDropdown from '../components/DwmsSelectDropdown';
import { addDaysToDateKey } from '../utils/organizationDate';
import TaskCategoryPieCharts from '../components/dashboard/TaskCategoryPieCharts';
import {
  canShowEmployeePerformanceTab,
  resolveEmployeePerformanceDestination,
} from '../utils/employeePerformanceAccess';

type GraphRange = '7d' | '1m' | '3m' | '1y' | 'all';

const REPORT_CACHE_MS = 5 * 60 * 1000;

const graphRangeOptions: Array<{
  value: GraphRange;
  label: string;
  days: number | 'all';
  metricLabel: string;
  timelineLabel: string;
}> = [
  { value: '7d', label: 'Last 7 days', days: 7, metricLabel: 'Tasks Performed Last 7 Days', timelineLabel: '7-day timeline' },
  { value: '1m', label: 'Last 30 days', days: 30, metricLabel: 'Tasks Performed Last 30 Days', timelineLabel: '30-day timeline' },
  { value: '3m', label: 'Last 90 days', days: 90, metricLabel: 'Tasks Performed Last 90 Days', timelineLabel: '90-day timeline' },
  { value: '1y', label: 'Last 1 year', days: 365, metricLabel: 'Tasks Performed Last 1 Year', timelineLabel: '1-year timeline' },
  { value: 'all', label: 'All time', days: 'all', metricLabel: 'Tasks Performed All Time', timelineLabel: 'All-time timeline' },
];

const fixedTrendGraphs = [
  { value: 'completionRate', label: 'All Tasks Completion Rate', suffix: '%', tooltipLabel: 'All Tasks' },
  { value: 'goodPracticeCompletionRate', label: 'Good Practices Completion Rate', suffix: '%', tooltipLabel: 'Good Practices' },
  { value: 'jobResponsibilityCompletionRate', label: 'Job Responsibility Completion Rate', suffix: '%', tooltipLabel: 'Job Responsibility' },
  { value: 'assignedTaskCompletionRate', label: 'Assigned Tasks Completion Rate', suffix: '%', tooltipLabel: 'Assigned Tasks' },
  { value: 'alertsCount', label: 'Alerts', suffix: '', tooltipLabel: 'Alerts' },
  { value: 'abnormalitiesCount', label: 'Abnormalities', suffix: '', tooltipLabel: 'Abnormalities' },
] as const;

function filterTrendByRange(
  trendData: DwmsDashboardTrendPoint[],
  days: number | 'all',
) {
  if (!trendData || trendData.length === 0) return [];
  if (days === 'all') return trendData;

  const pointsWithDates = trendData
    .map((point) => ({ point, date: point?.date?.slice(0, 10) ?? null }))
    .filter(({ date }) => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date));

  if (pointsWithDates.length === trendData.length) {
    const latestDate = pointsWithDates.reduce(
      (latest, { date }) => (date && date > latest ? date : latest),
      pointsWithDates[0].date as string,
    );
    const startDate = addDaysToDateKey(latestDate, -days + 1) ?? latestDate;

    return pointsWithDates
      .filter(({ date }) => date && date >= startDate && date <= latestDate)
      .map(({ point }) => point);
  }

  return trendData.slice(-days);
}

function getGraphRangeDays(range: GraphRange) {
  return graphRangeOptions.find((option) => option.value === range)?.days ?? graphRangeOptions[0].days;
}

export default function DashboardRoute() {
  return (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  );
}

function DashboardPage() {
  const { user, accessToken } = useAuthStore();

  // Tab: 'overview' | 'department' | 'employee' | 'my-team' | 'team'
  const [requestedTab, setActiveTab] = useState<'overview' | 'department' | 'employee' | 'my-team' | 'team'>('employee');
  const [graphRange, setGraphRange] = useState<GraphRange>('7d');
  // Selections
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [showSelectedEmployeeInsights, setShowSelectedEmployeeInsights] = useState(false);

  const accessQuery = useQuery({
    queryKey: ['dwms', 'reports', 'access', user?.organizationId, user?.userId],
    queryFn: () => DwmsService.getAccessCapabilities(accessToken ?? ''),
    enabled: Boolean(accessToken && user),
    staleTime: REPORT_CACHE_MS,
  });
  const access: DwmsAccessCapabilities | null = accessQuery.data ?? null;
  const activeTab =
    (requestedTab === 'overview' && access?.analyticsViewLevel !== 'ORGANIZATION') ||
    (requestedTab === 'department' && access?.analyticsViewLevel === 'OWN') ||
    (requestedTab === 'my-team' && !access?.hasReportees) ||
    (requestedTab === 'team' && !access?.canViewEmployeePerformance)
      ? 'employee'
      : requestedTab;

  const days = getGraphRangeDays(graphRange);
  const departmentsQuery = useQuery({
    queryKey: ['dwms', 'reports', 'departments', user?.organizationId],
    queryFn: () => DwmsService.getDepartments(accessToken ?? ''),
    enabled: Boolean(
      accessToken &&
      access &&
      activeTab === 'department' &&
      access.analyticsViewLevel === 'ORGANIZATION',
    ),
    staleTime: REPORT_CACHE_MS,
  });
  const departmentsList = useMemo(
    () => departmentsQuery.data ?? [],
    [departmentsQuery.data],
  );
  const usersQuery = useQuery({
    queryKey: ['dwms', 'reports', 'employees', user?.organizationId],
    queryFn: () => DwmsService.listUsers(accessToken ?? ''),
    enabled: Boolean(
      accessToken && access?.canViewEmployeePerformance && activeTab === 'team',
    ),
    staleTime: REPORT_CACHE_MS,
  });
  const employeesList = useMemo(() => {
    const permitted = new Set(access?.employeePerformanceEmployeeIds ?? []);
    return (usersQuery.data ?? [])
      .filter((employee) => permitted.has(employee.id))
      .map((employee) => ({
        id: employee.id,
        name: employee.name,
        department: employee.department?.name ?? employee.designation ?? undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [access?.employeePerformanceEmployeeIds, usersQuery.data]);

  const organizationDepartmentId =
    [selectedDeptId, user?.departmentId]
      .find((candidate) =>
        Boolean(candidate) &&
        departmentsList.some((department) => department.id === candidate),
      ) ?? departmentsList[0]?.id ?? '';
  const resolvedDepartmentId =
    access?.analyticsViewLevel === 'DEPARTMENT'
      ? user?.departmentId ?? ''
      : organizationDepartmentId;
  const resolvedSelectedEmpId =
    employeesList.some((employee) => employee.id === selectedEmpId)
      ? selectedEmpId
      : employeesList[0]?.id ?? access?.employeePerformanceEmployeeIds[0] ?? '';
  const employeeView = activeTab === 'my-team' ? 'team' : 'personal';
  const reportEmployeeId =
    activeTab === 'team' ? resolvedSelectedEmpId : access?.currentEmployeeId ?? '';

  const overviewQuery = useQuery({
    queryKey: ['dwms', 'reports', 'overview', user?.organizationId, days],
    queryFn: () => DwmsService.getDashboardOverview(accessToken ?? '', days),
    enabled: Boolean(accessToken && access && activeTab === 'overview'),
    staleTime: REPORT_CACHE_MS,
  });
  const departmentQuery = useQuery({
    queryKey: ['dwms', 'reports', 'department', resolvedDepartmentId, days],
    queryFn: () =>
      DwmsService.getDashboardDepartment(
        accessToken ?? '',
        resolvedDepartmentId,
        days,
      ),
    enabled: Boolean(
      accessToken && access && activeTab === 'department' && resolvedDepartmentId,
    ),
    staleTime: REPORT_CACHE_MS,
  });
  const employeeQuery = useQuery({
    queryKey: [
      'dwms',
      'reports',
      'employee',
      reportEmployeeId,
      employeeView,
      days,
    ],
    queryFn: () =>
      DwmsService.getDashboardEmployee(
        accessToken ?? '',
        reportEmployeeId,
        days,
        employeeView,
      ),
    enabled: Boolean(
      accessToken &&
      access &&
      reportEmployeeId &&
      (activeTab === 'employee' || activeTab === 'my-team' || activeTab === 'team'),
    ),
    staleTime: REPORT_CACHE_MS,
  });

  const overviewData: DwmsOverviewDashboardResponse | null = overviewQuery.data ?? null;
  const departmentData: DwmsDepartmentDashboardResponse | null = departmentQuery.data ?? null;
  const employeeData: DwmsEmployeeDashboardResponse | null = employeeQuery.data ?? null;
  const activeReportQuery =
    activeTab === 'overview'
      ? overviewQuery
      : activeTab === 'department'
        ? departmentQuery
        : employeeQuery;
  const metadataLoading =
    (activeTab === 'department' &&
      access?.analyticsViewLevel === 'ORGANIZATION' &&
      departmentsQuery.isPending) ||
    (activeTab === 'team' &&
      Boolean(access?.canViewEmployeePerformance) &&
      usersQuery.isPending);
  const loading = accessQuery.isPending || metadataLoading || activeReportQuery.isFetching;
  const activeError = accessQuery.error ?? activeReportQuery.error ??
    (activeTab === 'department' ? departmentsQuery.error : null) ??
    (activeTab === 'team' ? usersQuery.error : null);
  const selectionError =
    !metadataLoading && activeTab === 'department' && !resolvedDepartmentId
      ? 'No department selected or assigned.'
      : !metadataLoading && activeTab === 'team' && !resolvedSelectedEmpId
        ? 'No employee selected or assigned.'
        : null;
  const error =
    activeError instanceof Error ? activeError.message : selectionError;
  const stats = useMemo(() => {
    if (activeTab === 'overview') return overviewData?.summary;
    if (activeTab === 'department') return departmentData?.summary;
    if (activeTab === 'my-team') return employeeData?.teamSummary;
    if (activeTab === 'employee' || activeTab === 'team') return employeeData?.summary;
    return null;
  }, [activeTab, overviewData, departmentData, employeeData]);

  const completionTrends = useMemo(() => {
    if (activeTab === 'overview') return overviewData?.trends?.tasksPerformedToday ?? [];
    if (activeTab === 'department') return departmentData?.trends?.tasksPerformedToday ?? [];
    if (activeTab === 'my-team') return employeeData?.teamTrends?.tasksPerformedToday ?? [];
    if (activeTab === 'employee' || activeTab === 'team') return employeeData?.trends?.tasksPerformedToday ?? [];
    return [];
  }, [activeTab, overviewData, departmentData, employeeData]);

  const selectedGraphRange = graphRangeOptions.find((option) => option.value === graphRange) ?? graphRangeOptions[0];

  const filteredCompletionTrends = useMemo(
    () => filterTrendByRange(completionTrends, selectedGraphRange.days),
    [completionTrends, selectedGraphRange.days]
  );

  const canSelectEmployee = useCallback(
    (employeeId: string) =>
      resolveEmployeePerformanceDestination(employeeId, access) !== null,
    [access],
  );

  // Callback to instantly switch to Department tab when clicking on Heatmap
  const handleSelectDepartment = (deptId: string) => {
    setSelectedDeptId(deptId);
    setActiveTab('department');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectDepartmentEmployee = (employeeId: string) => {
    const destination = resolveEmployeePerformanceDestination(employeeId, access);
    if (!destination) return;
    if (destination === 'my-performance') {
      setShowSelectedEmployeeInsights(false);
      setActiveTab('employee');
      setSelectedEmpId('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSelectedEmpId(employeeId);
    setShowSelectedEmployeeInsights(true);
    setActiveTab('team');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">

      <DwmsTabHeader
        activeTab={activeTab}
        onTabChange={(tab) => {
          setShowSelectedEmployeeInsights(false);
          if (tab === 'employee') {
            setActiveTab('employee');
          } else if (tab === 'my-team') {
            setActiveTab('my-team');
          } else if (tab === 'team') {
            if (!access?.canViewEmployeePerformance) return;
            setActiveTab('team');
            if (employeesList.length > 0) {
              setSelectedEmpId(employeesList[0].id);
            } else if (access.employeePerformanceEmployeeIds[0]) {
              setSelectedEmpId(access.employeePerformanceEmployeeIds[0]);
            }
          } else if (tab === 'department') {
            setActiveTab('department');
          } else {
            setActiveTab('overview');
          }
        }}
        tabs={[
          { key: 'employee', label: 'My Performance', dotColor: 'bg-blue-500' },
          ...(access?.hasReportees
            ? [{
                key: 'my-team' as const,
                label: 'My Team Performance',
                dotColor: 'bg-cyan-500',
              }]
            : []),
          ...(canShowEmployeePerformanceTab(access)
            ? [
                { key: 'team' as const, label: 'Employee Performance', dotColor: 'bg-indigo-500' },
              ]
            : []),
          ...(access?.analyticsViewLevel === 'DEPARTMENT' || access?.analyticsViewLevel === 'ORGANIZATION'
            ? [
                { key: 'department' as const, label: 'Department Performance', dotColor: 'bg-violet-500' },
              ]
            : []),
          ...(access?.analyticsViewLevel === 'ORGANIZATION'
            ? [{ key: 'overview' as const, label: 'Organisational Performance', dotColor: 'bg-emerald-500' }]
            : []),
        ]}
        rightContent={(
          <div className="relative z-40 flex translate-y-1 flex-wrap items-center gap-3">
            {activeTab === 'department' && access?.analyticsViewLevel === 'ORGANIZATION' && departmentsList.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-app font-semibold">Department:</span>
                <div className="w-48">
                  <DwmsSelectDropdown
                    value={resolvedDepartmentId}
                    options={departmentsList.map((dept) => ({ value: dept.id, label: dept.name }))}
                    onChange={setSelectedDeptId}
                    placeholder="Select department"
                    triggerClassName="h-10 rounded-xl border-border-app bg-white px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-accent-app"
                  />
                </div>
              </div>
            )}

            {activeTab === 'team' && access?.canViewEmployeePerformance && employeesList.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-60">
                  <DwmsSelectDropdown
                    value={resolvedSelectedEmpId}
                    options={employeesList.map((emp) => ({
                        value: emp.id,
                        label: emp.name,
                        secondaryLabel: emp.department || 'No Dept',
                        variant: 'employee' as const,
                      }))}
                    onChange={(employeeId) => {
                      setSelectedEmpId(employeeId);
                      setShowSelectedEmployeeInsights(true);
                    }}
                    placeholder="Select employee"
                    searchEnabled
                    triggerClassName="h-10 rounded-xl border-border-app bg-white px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-accent-app"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      />

      {/* Global Loading / Error handler */}
      {error && (
        <div className="rounded-3xl border border-rose-200/60 bg-rose-50 dark:bg-rose-950/20 px-5 py-4 text-center text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-dashed border-border-app bg-white px-5 py-32 text-center text-sm text-muted-app">
          <svg className="animate-spin h-8 w-8 text-accent-app mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading insights...
        </div>
      ) : (
        <div className="space-y-6">

          {/* Show the shared report layout for every populated performance scope. */}
          {(activeTab !== 'my-team' || !!employeeData?.reporteesPerformance?.length) &&
            (activeTab !== 'team' || resolvedSelectedEmpId !== access?.currentEmployeeId || showSelectedEmployeeInsights) && (
            <>
              {/* 1. Period controls and KPI summary */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs font-semibold text-muted-app">Period:</span>
                <div className="w-44">
                  <DwmsSelectDropdown
                    value={graphRange}
                    options={graphRangeOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    onChange={(value) => setGraphRange(value as GraphRange)}
                    placeholder="Select period"
                    ariaLabel="Dashboard period"
                    triggerClassName="h-10 rounded-xl border-border-app bg-white px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-accent-app"
                  />
                </div>
              </div>

              {stats && (
                <KpiCards
                  stats={stats}
                  activeTab={activeTab === 'team' || activeTab === 'my-team' ? 'employee' : activeTab}
                  periodLabel={selectedGraphRange.metricLabel}
                />
              )}

              {stats?.taskCategoryBreakdown && (
                <TaskCategoryPieCharts
                  breakdown={stats.taskCategoryBreakdown}
                  periodLabel={selectedGraphRange.label}
                />
              )}

              {/* 2. Completion, alert, and abnormality timelines */}
              <section aria-labelledby="report-trends-heading">
                <div className="mb-3">
                  <h2 id="report-trends-heading" className="font-semibold text-text-app">
                    Performance Trends
                  </h2>
                  <p className="mt-1 text-xs text-muted-app">
                    Daily values for {selectedGraphRange.label.toLowerCase()}.
                  </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
                  {fixedTrendGraphs.map((graph) => {
                    const graphTrendData = graph.suffix === '%'
                      ? filteredCompletionTrends.filter(
                        (point) => point[graph.value] !== null && point[graph.value] !== undefined,
                      )
                      : filteredCompletionTrends;

                    return (
                      <div key={graph.value} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                        <div className="mb-3 border-b border-border-app pb-2">
                          <h3 className="font-semibold text-text-app">{graph.label}</h3>
                          <p className="text-xs text-muted-app">{selectedGraphRange.timelineLabel}</p>
                        </div>
                        <SVGLineChart
                          trendData={graphTrendData}
                          valueKey={graph.value}
                          ySuffix={graph.suffix}
                          tooltipLabel={graph.tooltipLabel}
                          height={160}
                          variant="line"
                          showTaskTotals={graph.value === 'completionRate'}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 3. Scope comparison and ranking bars */}
              {activeTab === 'overview' && overviewData && (
                <OverviewDashboard
                  overviewData={overviewData}
                  onSelectDepartment={handleSelectDepartment}
                  onSelectEmployee={handleSelectDepartmentEmployee}
                  canSelectEmployee={canSelectEmployee}
                />
              )}

              {activeTab === 'department' && departmentData && (
                <DepartmentDashboard
                  departmentData={departmentData}
                  onSelectEmployee={handleSelectDepartmentEmployee}
                  canSelectEmployee={canSelectEmployee}
                />
              )}

            </>
          )}

          {activeTab === 'employee' && employeeData?.employee && (
            <EmployeeDashboard
              employeeData={{ ...employeeData, employee: employeeData.employee }}
              loggedInUserId={access?.currentEmployeeId || user?.userId || ''}
              onSelectEmployee={handleSelectDepartmentEmployee}
              activeSubTab="insights"
            />
          )}

          {activeTab === 'my-team' && employeeData?.employee && (
            employeeData.reporteesPerformance?.length ? (
              <EmployeeDashboard
                employeeData={{ ...employeeData, employee: employeeData.employee }}
                loggedInUserId={access?.currentEmployeeId || employeeData.employee.id}
                onSelectEmployee={handleSelectDepartmentEmployee}
                activeSubTab="team"
              />
            ) : (
              <div className="rounded-3xl border border-dashed border-border-app bg-white px-5 py-20 text-center">
                <h3 className="font-semibold text-text-app">No team members linked</h3>
                <p className="mt-2 text-sm text-muted-app">
                  Employees assigned to you through the reporting-manager hierarchy will appear here.
                </p>
              </div>
            )
          )}

          {activeTab === 'team' && employeeData?.employee && (
            <>
              <EmployeeDashboard
                employeeData={{ ...employeeData, employee: employeeData.employee }}
                loggedInUserId={access?.currentEmployeeId || user?.userId || ''}
                onSelectEmployee={handleSelectDepartmentEmployee}
                activeSubTab={resolvedSelectedEmpId === access?.currentEmployeeId && !showSelectedEmployeeInsights ? 'team' : 'insights'}
              />
              {(resolvedSelectedEmpId !== access?.currentEmployeeId || showSelectedEmployeeInsights) && accessToken && (
                <EmployeeDwmsPanel
                  employeeId={employeeData.employee.id}
                  accessToken={accessToken}
                  jobTitle={employeeData.employee.role}
                  canManageActivities={false}
                  showApplicableActivities={false}
                />
              )}
            </>
          )}

        </div>
      )}

    </div>
  );
}
