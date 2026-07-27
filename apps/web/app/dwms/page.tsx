"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import TaskMiniCard from './components/home/TaskMiniCard';
import { useAuthStore } from '@/store/auth.store';
import { DwmsService, getDwmsErrorMessage, type DwmsTaskItem as TaskItem, type DwmsTaskStatus as TaskStatus } from '@/services/dwms.service';
import { PlusCircle } from 'lucide-react';

function getTodayDateKey() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}

function HomeContent() {
  const router = useRouter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeAlertsCount, setActiveAlertsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? '';
      const tasksRes = await DwmsService.getTodayTasks(token, getTodayDateKey());
      setTasks(tasksRes?.tasks ?? []);

      const alertsRes = await DwmsService.getOpenAlertCount(token);
      setActiveAlertsCount(Number(alertsRes?.count ?? 0));
    } catch (err: unknown) {
      setError(getDwmsErrorMessage(err, 'Failed to load home page data'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Filter tasks to only show those due today
  const todayTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.frequency === 'DAILY') {
        return true;
      }
      
      let dueDate: Date | null = null;
      if (task.frequency === 'WEEKLY') {
        const baseDate = new Date(task.dueAt);
        const day = baseDate.getDay();
        const diff = 6 - day;
        baseDate.setDate(baseDate.getDate() + diff);
        dueDate = baseDate;
      } else if (task.frequency === 'MONTHLY') {
        const baseDate = new Date(task.dueAt);
        dueDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
      } else if (task.assignedBy && task.assignedBy.name) {
        dueDate = new Date(task.dueAt);
      }

      if (!dueDate || isNaN(dueDate.getTime())) {
        return false;
      }

      const today = new Date();
      return dueDate.toDateString() === today.toDateString();
    });
  }, [tasks]);

  const stats = useMemo(() => {
    const total = todayTasks.length;
    const done = todayTasks.filter(t => t.status === 'DONE').length;
    const remaining = total - done;
    const productivity = total > 0 ? Math.round((done / total) * 100) : 100;
    return { total, done, remaining, productivity };
  }, [todayTasks]);

  const statusCompletion: Record<TaskStatus, number> = {
    PENDING: 0,
    IN_PROGRESS: 20,
    DONE: 100,
    APPROVAL_PENDING: 100,
    PARTLY_DONE: 50,
    LESS_THAN_50: 10,
    NOT_APPLICABLE: 0,
    OVERDUE: 0,
  };

  async function handleStatusChange(instanceId: string, nextStatus: TaskStatus) {
    setSavingId(instanceId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? '';
      await DwmsService.updateTaskStatus(token, instanceId, {
        status: nextStatus,
        completionPercent: statusCompletion[nextStatus],
      });
      await loadData();
    } catch (saveError: unknown) {
      setError(getDwmsErrorMessage(saveError, 'Failed to update task status'));
    } finally {
      setSavingId(null);
    }
  }

  async function handleAcknowledgement(taskId: string) {
    setSavingId(taskId);
    setError(null);
    try {
      const token = useAuthStore.getState().accessToken ?? '';
      await DwmsService.acknowledgeTask(token, taskId);
      await loadData();
    } catch (saveError: unknown) {
      setError(getDwmsErrorMessage(saveError, 'Failed to acknowledge task'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-none flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Today at a Glance Stats */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Tasks Done */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-40 transition hover:scale-[1.01] hover:border-accent-app/20 duration-150">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app">Tasks done</p>
              <h3 className="text-4xl font-extrabold tracking-tight text-text-app mt-2">
                {stats.done}<span className="text-muted-app text-2xl font-light">/{stats.total}</span>
              </h3>
            </div>
            <div>
              <p className="text-xs text-muted-app mb-2.5 font-light">{stats.remaining} remaining</p>
              <div className="w-full bg-border-app h-1.5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent-app rounded-full transition-all duration-300"
                  style={{ width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Open Alerts */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-40 transition hover:scale-[1.01] hover:border-accent-app/20 duration-150">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app">Open alerts</p>
              <h3 className="text-4xl font-extrabold tracking-tight text-text-app mt-2">
                {activeAlertsCount}
              </h3>
            </div>
            <div>
              <p className="text-xs text-rose-500 font-medium mb-2.5 flex items-center gap-1">
                <span>⚠️</span> Action needed
              </p>
              <div className="w-full bg-rose-500/10 h-1 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-rose-500 rounded-full transition-all duration-300 ${
                    activeAlertsCount > 0 ? 'w-2/3' : 'w-0'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Card 3: Productivity */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between h-40 transition hover:scale-[1.01] hover:border-accent-app/20 duration-150">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-app">Productivity</p>
              <h3 className="text-4xl font-extrabold tracking-tight text-text-app mt-2">
                {stats.productivity}<span className="text-muted-app text-2xl font-light">%</span>
              </h3>
            </div>
            <div>
              <p className="text-xs text-emerald-500 font-medium mb-2.5 flex items-center gap-0.5">
                <span>↗</span> +6% vs last week
              </p>
              <div className="w-full bg-purple-500/10 h-1 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${stats.productivity}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Today's Tasks Section */}
        <section className="mt-4">
          <div className="flex flex-col gap-3 border-b border-border-app pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold tracking-tight text-text-app">Today&apos;s tasks</h2>
            <button 
              onClick={() => router.push('/dwms/actions/new')}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-transparent bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 cursor-pointer select-none sm:w-auto"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Assign a Task</span>
            </button>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app">
              Loading tasks...
            </div>
          ) : todayTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-app bg-white py-16 text-center text-sm text-muted-app italic">
              🎉 No tasks due today. Enjoy your day!
            </div>
          ) : (
            <div className="space-y-3">
              {todayTasks.map((task) => (
                <TaskMiniCard
                  key={task.instanceId}
                  task={task}
                  onClick={() => {}}
                  onStatusChange={handleStatusChange}
                  onAcknowledgement={handleAcknowledgement}
                  saving={savingId === task.instanceId}
                />
              ))}
            </div>
          )}
        </section>

    </div>
  );
}
