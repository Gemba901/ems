'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BriefcaseBusiness, CalendarDays, FileText, Sparkles, TrendingUp, Users, ShieldCheck, BellRing } from 'lucide-react';

const stats = [
  { label: 'Total Employees', value: '1,248', icon: Users, trend: '+5.1%' },
  { label: 'Active Employees', value: '1,202', icon: ShieldCheck, trend: '+2.3%' },
  { label: 'On Leave', value: '24', icon: CalendarDays, trend: '-2.0%' },
  { label: 'New Hires', value: '12', icon: Sparkles, trend: '+8.0%' },
  { label: 'Departments', value: '12', icon: BriefcaseBusiness, trend: '+1' },
  { label: 'Payroll (MTD)', value: '$450k', icon: FileText, trend: 'Updated' },
];

const recentActivity = [
  { title: 'New onboarding completed', description: 'Michael Chen joined the Engineering team.', time: '2 hours ago', icon: Users },
  { title: 'Payroll finalized', description: 'Monthly payroll was successfully processed.', time: '5 hours ago', icon: FileText },
  { title: 'Leave approved', description: 'Sarah Jenkins requested a 3-day vacation.', time: 'Yesterday', icon: CalendarDays },
  { title: 'System update', description: 'A new review workflow was deployed.', time: 'Yesterday', icon: BellRing },
];

const departmentDistribution = [
  { name: 'Engineering', value: 40, color: 'bg-sky-600' },
  { name: 'Sales', value: 25, color: 'bg-emerald-600' },
  { name: 'Design', value: 15, color: 'bg-violet-600' },
  { name: 'HR', value: 10, color: 'bg-amber-600' },
  { name: 'Finance', value: 10, color: 'bg-rose-600' },
];

const actionCards = [
  { id: 'team', title: 'View team directory', description: 'Browse the full employee roster and recent changes.', icon: Users, href: '/DGK/employees' },
  { id: 'leave', title: 'Review leave queue', description: 'Monitor pending approvals and upcoming absences.', icon: CalendarDays, href: null },
  { id: 'report', title: 'Export summary', description: 'Share a polished HR snapshot with your leadership team.', icon: FileText, href: null },
];

export default function HRDashboardPage() {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState('team');

  const handleAction = (actionId: string, href?: string | null) => {
    setActiveAction(actionId);
    if (href) {
      router.push(href);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                <TrendingUp className="h-4 w-4" />
                People operations overview
              </div>
              <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-600">A professional snapshot of attendance, staffing, and people activity.</p>
            </div>
            <button
              onClick={() => handleAction('team', '/DGK/employees')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Users className="h-4 w-4" />
              Open employee view
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{stat.value}</p>
                  </div>
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-emerald-600">{stat.trend}</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Headcount trend</h2>
                <p className="text-sm text-slate-500">A steady growth outlook for the year.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">+12% YoY</span>
            </div>

            <div className="flex h-56 items-end gap-3 rounded-2xl bg-slate-50 p-4">
              {['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'].map((month, index) => {
                const heights = [58, 64, 72, 84, 79, 88];
                return (
                  <div key={month} className="flex flex-1 flex-col items-center gap-2">
                    <div className="w-full rounded-t-xl bg-slate-900" style={{ height: `${heights[index]}%` }} />
                    <span className="text-xs font-medium text-slate-500">{month}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Quick actions</h2>
                <p className="text-sm text-slate-500">Keep the most common workflows in reach.</p>
              </div>
            </div>
            <div className="space-y-3">
              {actionCards.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleAction(action.id, action.href)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${activeAction === action.id ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                        <p className="text-xs text-slate-500">{action.description}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
                <p className="text-sm text-slate-500">The latest updates across the department.</p>
              </div>
            </div>
            <div className="space-y-4">
              {recentActivity.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="text-sm text-slate-500">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Department mix</h2>
              <p className="text-sm text-slate-500">How the workforce is distributed across functions.</p>
            </div>
            <div className="space-y-4">
              {departmentDistribution.map((dept) => (
                <div key={dept.name}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{dept.name}</span>
                    <span className="text-slate-500">{dept.value}%</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100">
                    <div className={`${dept.color} h-2.5 rounded-full`} style={{ width: `${dept.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
