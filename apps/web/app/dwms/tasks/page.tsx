"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import TaskDashboard from '../components/home/TaskDashboard';
import AssignedByMeView from '../components/AssignedByMeView';
import AssignmentViewSwitch, { type AssignmentView } from '../components/AssignmentViewSwitch';

function AssignedTasksWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: AssignmentView = searchParams.get('view') === 'by-me' ? 'by-me' : 'to-me';
  const switcher = (
    <AssignmentViewSwitch
      value={view}
      onChange={(nextView) => router.push(nextView === 'by-me' ? '/dwms/tasks?view=by-me' : '/dwms/tasks')}
    />
  );

  return view === 'by-me'
    ? <AssignedByMeView rightContent={switcher} />
    : <TaskDashboard source="assigned" rightContent={switcher} />;
}

export default function TasksPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading assigned tasks...</div>}>
        <AssignedTasksWorkspace />
      </Suspense>
    </ProtectedRoute>
  );
}
