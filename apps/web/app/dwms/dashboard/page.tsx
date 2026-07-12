"use client";

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuthStore } from '@/store/auth.store';
import {
  DwmsService,
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
import DwmsTabHeader from '../components/DwmsTabHeader';
import DwmsSelectDropdown from '../components/DwmsSelectDropdown';

type GraphRange = '7d' | '1m' | '3m';

const graphRangeOptions: Array<{ value: GraphRange; label: string; days: number }> = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '1m', label: '1 Month', days: 30 },
  { value: '3m', label: '3 Month', days: 90 },
];

function filterTrendByRange(trendData: DwmsDashboardTrendPoint[], days: number) {
  if (!trendData || trendData.length === 0) return [];

  const pointsWithDates = trendData
    .map((point) => ({ point, date: point?.date ? new Date(point.date) : null }))
    .filter(({ date }) => date && !isNaN(date.getTime()));

  if (pointsWithDates.length === trendData.length) {
    const latestDate = pointsWithDates.reduce(
      (latest, { date }) => (date && date > latest ? date : latest),
      pointsWithDates[0].date as Date
    );
    const startDate = new Date(latestDate);
    startDate.setDate(startDate.getDate() - days + 1);

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
  const { user } = useAuthStore();

  // Tab: 'overview' | 'department' | 'employee' | 'team'
  const [activeTab, setActiveTab] = useState<'overview' | 'department' | 'employee' | 'team'>('employee');
  const [graphRange, setGraphRange] = useState<GraphRange>('7d');

  // Selections
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [hasDefaultedTeamEmp, setHasDefaultedTeamEmp] = useState(false);

  // Loaded Data
  const [overviewData, setOverviewData] = useState<DwmsOverviewDashboardResponse | null>(null);
  const [departmentData, setDepartmentData] = useState<DwmsDepartmentDashboardResponse | null>(null);
  const [employeeData, setEmployeeData] = useState<DwmsEmployeeDashboardResponse | null>(null);

  const overviewDataRef = useRef<DwmsOverviewDashboardResponse | null>(null);
  const departmentDataRef = useRef<DwmsDepartmentDashboardResponse | null>(null);

  const updateOverviewData = useCallback((data: DwmsOverviewDashboardResponse | null) => {
    setOverviewData(data);
    overviewDataRef.current = data;
  }, []);

  const updateDepartmentData = useCallback((data: DwmsDepartmentDashboardResponse | null) => {
    setDepartmentData(data);
    departmentDataRef.current = data;
  }, []);

  // Lists for drop downs
  const [departmentsList, setDepartmentsList] = useState<Array<{ id: string; name: string }>>([]);
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; department?: string }>>([]);

  // Loaders
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset defaulted flag when activeTab changes
  useEffect(() => {
    if (activeTab !== 'team') {
      setHasDefaultedTeamEmp(false);
    }
  }, [activeTab]);



  // Initialize view tabs based on user role
  useEffect(() => {
    if (!user) return;
    setActiveTab('employee');
    setSelectedEmpId(user.userId);
    if (user.departmentId) {
      setSelectedDeptId(user.departmentId);
    }
  }, [user]);

  // Load lists when overview data or department scoreboard is fetched
  useEffect(() => {
    if (overviewData) {
      if (overviewData.departmentCompliance) {
        setDepartmentsList(overviewData.departmentCompliance.map((d) => ({ id: d.id, name: d.name })));
      }
    }
  }, [overviewData]);

  // Update and sort employeesList alphabetically, and default selectedEmpId on the team tab
  useEffect(() => {
    let list: Array<{ id: string; name: string; department?: string }> = [];
    if (overviewData?.employeeScoreboard) {
      list = overviewData.employeeScoreboard.map((e) => ({ id: e.id, name: e.name, department: e.department }));
    } else if (departmentData?.employeeScoreboard) {
      list = departmentData.employeeScoreboard.map((e) => ({ id: e.id, name: e.name, department: departmentData.departmentName }));
    }

    if (list.length > 0) {
      const sorted = list.sort((a, b) => a.name.localeCompare(b.name));
      setEmployeesList(sorted);

      // Default selectedEmpId to the first employee in the sorted list when entering 'team' tab
      if (activeTab === 'team' && !hasDefaultedTeamEmp) {
        setSelectedEmpId(sorted[0].id);
        setHasDefaultedTeamEmp(true);
      }
    }
  }, [overviewData, departmentData, activeTab, hasDefaultedTeamEmp]);

  // Fetch function
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const token = useAuthStore.getState().accessToken ?? '';
      const days = getGraphRangeDays(graphRange);
      if (activeTab === 'overview') {
        const data = await DwmsService.getDashboardOverview(token, days);
        updateOverviewData(data);
      } else if (activeTab === 'department') {
        // If MANAGEMENT and no department selected yet, load overview to extract departments
        let deptId = selectedDeptId;
        if (!deptId && user.roleLevel === 'MANAGEMENT') {
          const overview = await DwmsService.getDashboardOverview(token, days);
          updateOverviewData(overview);
          const firstDepartment = overview.departmentCompliance?.[0];
          if (firstDepartment) {
            deptId = firstDepartment.id;
            setSelectedDeptId(deptId);
          }
        } else if (!deptId && user.roleLevel === 'HOD') {
          deptId = user.departmentId || '';
          setSelectedDeptId(deptId);
        }

        if (deptId) {
          const data = await DwmsService.getDashboardDepartment(token, deptId, days);
          updateDepartmentData(data);
        } else {
          setError('No department selected or assigned.');
        }
      } else if (activeTab === 'employee' || activeTab === 'team') {
        let empId = selectedEmpId;

        // Ensure lists are loaded for role-based dropdown filter
        if (user.roleLevel === 'MANAGEMENT' && !overviewDataRef.current) {
          const overview = await DwmsService.getDashboardOverview(token, days);
          updateOverviewData(overview);
          const firstEmployee = overview.employeeScoreboard?.[0];
          if (!empId && firstEmployee) {
            empId = firstEmployee.id;
            setSelectedEmpId(empId);
          }
        } else if (user.roleLevel === 'HOD' && !departmentDataRef.current) {
          const deptId = user.departmentId || '';
          const dept = await DwmsService.getDashboardDepartment(token, deptId, days);
          updateDepartmentData(dept);
          const firstEmployee = dept.employeeScoreboard?.[0];
          if (!empId && firstEmployee) {
            empId = firstEmployee.id;
            setSelectedEmpId(empId);
          }
        }

        if (activeTab === 'team' && user) {
          // If viewing reportee, fetch reportee's data, otherwise fetch user's own team data
          empId = selectedEmpId && selectedEmpId !== user.userId ? selectedEmpId : user.userId;
        }

        if (empId) {
          const data = await DwmsService.getDashboardEmployee(token, empId, days);
          setEmployeeData(data);
          if (data.employee?.id && data.employee.id !== empId) {
            setSelectedEmpId(data.employee.id);
          }
        } else {
          setError('No employee selected or assigned.');
        }
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, graphRange, selectedDeptId, selectedEmpId, user, updateOverviewData, updateDepartmentData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);
  const stats = useMemo(() => {
    if (activeTab === 'overview') return overviewData?.summary;
    if (activeTab === 'department') return departmentData?.summary;
    if (activeTab === 'employee' || activeTab === 'team') return employeeData?.summary;
    return null;
  }, [activeTab, overviewData, departmentData, employeeData]);

  const completionTrends = useMemo(() => {
    if (activeTab === 'overview') return overviewData?.trends?.tasksPerformedToday ?? [];
    if (activeTab === 'department') return departmentData?.trends?.tasksPerformedToday ?? [];
    if (activeTab === 'employee' || activeTab === 'team') return employeeData?.trends?.tasksPerformedToday ?? [];
    return [];
  }, [activeTab, overviewData, departmentData, employeeData]);

  const ackTrends = useMemo(() => {
    if (activeTab === 'overview') return overviewData?.trends?.timeToAcknowledge ?? [];
    if (activeTab === 'department') return departmentData?.trends?.timeToAcknowledge ?? [];
    if (activeTab === 'employee' || activeTab === 'team') return employeeData?.trends?.timeToAcknowledge ?? [];
    return [];
  }, [activeTab, overviewData, departmentData, employeeData]);

  const selectedGraphRange = graphRangeOptions.find((option) => option.value === graphRange) ?? graphRangeOptions[0];

  const filteredCompletionTrends = useMemo(
    () => filterTrendByRange(completionTrends, selectedGraphRange.days),
    [completionTrends, selectedGraphRange.days]
  );

  const filteredAckTrends = useMemo(
    () => filterTrendByRange(ackTrends, selectedGraphRange.days),
    [ackTrends, selectedGraphRange.days]
  );

  // Callback to instantly switch to Department tab when clicking on Heatmap
  const handleSelectDepartment = (deptId: string) => {
    setSelectedDeptId(deptId);
    setActiveTab('department');
  };

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">

      <DwmsTabHeader
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'employee') {
            setActiveTab('employee');
            if (user) setSelectedEmpId(user.userId);
          } else if (tab === 'team') {
            setActiveTab('team');
            if (employeesList.length > 0) {
              setSelectedEmpId(employeesList[0].id);
              setHasDefaultedTeamEmp(true);
            } else if (user) {
              setSelectedEmpId(user.userId);
              setHasDefaultedTeamEmp(false);
            }
          } else if (tab === 'department') {
            setActiveTab('department');
          } else {
            setActiveTab('overview');
          }
        }}
        tabs={[
          { key: 'employee', label: 'My Performance', dotColor: 'bg-blue-500' },
          ...(user?.roleLevel === 'MANAGEMENT' || user?.roleLevel === 'HOD'
            ? [
                { key: 'team' as const, label: 'Employee Performance', dotColor: 'bg-indigo-500' },
                { key: 'department' as const, label: 'Department Performance', dotColor: 'bg-violet-500' },
              ]
            : []),
          ...(user?.roleLevel === 'MANAGEMENT'
            ? [{ key: 'overview' as const, label: 'Organisational Performance', dotColor: 'bg-emerald-500' }]
            : []),
        ]}
        rightContent={(
          <div className="flex flex-wrap items-center gap-3 pb-3">
            {activeTab === 'department' && user?.roleLevel === 'MANAGEMENT' && departmentsList.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-app font-semibold">Department:</span>
                <div className="w-48">
                  <DwmsSelectDropdown
                    value={selectedDeptId}
                    options={departmentsList.map((dept) => ({ value: dept.id, label: dept.name }))}
                    onChange={setSelectedDeptId}
                    placeholder="Select department"
                    triggerClassName="h-10 rounded-xl border-border-app bg-panel-app px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-accent-app"
                  />
                </div>
              </div>
            )}

            {activeTab === 'team' && (user?.roleLevel === 'MANAGEMENT' || user?.roleLevel === 'HOD') && employeesList.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-app font-semibold">Inspect Employee:</span>
                <div className="w-60">
                  <DwmsSelectDropdown
                    value={selectedEmpId === user?.userId ? '' : selectedEmpId}
                    options={[
                      { value: '', label: 'Show All Reportees' },
                      ...employeesList.map((emp) => ({
                        value: emp.id,
                        label: emp.name,
                        secondaryLabel: emp.department || 'No Dept',
                        variant: 'employee' as const,
                      })),
                    ]}
                    onChange={(value) => {
                      setSelectedEmpId(value || user?.userId || '');
                    }}
                    placeholder="Show all reportees"
                    searchEnabled
                    triggerClassName="h-10 rounded-xl border-border-app bg-panel-app px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-accent-app"
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
        <div className="rounded-3xl border border-dashed border-border-app bg-white px-5 py-32 text-center text-sm text-muted-app backdrop-blur-xl">
          <svg className="animate-spin h-8 w-8 text-accent-app mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading insights...
        </div>
      ) : (
        <div className="space-y-6">

          {/* Render charts and cards only when we are NOT in the 'team' tab, OR when in 'team' tab but viewing a specific employee */}
          {(activeTab !== 'team' || selectedEmpId !== user?.userId) && (
            <>
              {/* 1. Visual Charts Row (Completion Trend & Acknowledgement Time) */}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-xs font-semibold text-muted-app">Graph range:</span>
                <div className="inline-flex rounded-xl border border-border-app bg-white p-1 shadow-sm">
                  {graphRangeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setGraphRange(option.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        graphRange === option.value
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Completion Trend Chart */}
                <div className="rounded-3xl border border-border-app bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border-app pb-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-text-app">Completion Trend</h3>
                      <p className="text-xs text-muted-app">
                        {selectedGraphRange.days}-day task compliance timeline
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-app font-semibold">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent-app" />
                      Compliance Rate %
                    </div>
                  </div>
                  <SVGLineChart
                    trendData={filteredCompletionTrends}
                    valueKey="completionRate"
                    ySuffix="%"
                    tooltipLabel="Compliance"
                  />
                </div>

                {/* Acknowledgement Time Chart */}
                <div className="rounded-3xl border border-border-app bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border-app pb-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-text-app">Avg Acknowledge Time</h3>
                      <p className="text-xs text-muted-app">
                        {selectedGraphRange.days}-day average task acknowledgement delay
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-app font-semibold">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Ack Time (min)
                    </div>
                  </div>
                  <SVGLineChart
                    trendData={filteredAckTrends}
                    valueKey="avgAcknowledgeTimeMin"
                    ySuffix=" min"
                    tooltipLabel="Avg Ack Time"
                  />
                </div>
              </div>

              {/* 2. KPI Cards */}
              {stats && <KpiCards stats={stats} activeTab={activeTab === 'team' ? 'employee' : activeTab} />}
            </>
          )}

          {/* 3. Detailed Tab Dashboards */}
          {activeTab === 'overview' && overviewData && (
            <OverviewDashboard
              overviewData={overviewData}
              onSelectDepartment={handleSelectDepartment}
            />
          )}

          {activeTab === 'department' && departmentData && (
            <DepartmentDashboard departmentData={departmentData} />
          )}

          {activeTab === 'employee' && employeeData?.employee && (
            <EmployeeDashboard
              employeeData={{ ...employeeData, employee: employeeData.employee }}
              loggedInUserId={user?.userId || ''}
              onSelectEmployee={setSelectedEmpId}
              activeSubTab="insights"
            />
          )}

          {activeTab === 'team' && employeeData?.employee && (
            <EmployeeDashboard
              employeeData={{ ...employeeData, employee: employeeData.employee }}
              loggedInUserId={user?.userId || ''}
              onSelectEmployee={setSelectedEmpId}
              activeSubTab={selectedEmpId === user?.userId ? 'team' : 'insights'}
            />
          )}

        </div>
      )}

    </div>
  );
}
