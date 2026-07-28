"use client";
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import TaskDashboard from '../components/home/TaskDashboard';

export default function TasksPage() {
  return (
    <ProtectedRoute>
      <TaskDashboard />
    </ProtectedRoute>
  );
}
