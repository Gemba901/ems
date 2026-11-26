"use client";

import { PageHeader } from "@/components/patterns/PageHeader";
import { useAuthStore } from "@/store/auth.store";
import { ClockCard } from "@/components/work/attendance/ClockCard";
import { MyWorkLocation } from "@/components/work/locations/MyWorkLocation";
import { MyTasksList } from "@/components/work/tasks/MyTasksList";

// Attendance and tasks load independently, so an attendance failure never hides tasks.
// On small screens attendance comes first; on desktop it sits beside the task list.
export default function WorkHomePage() {
  const name = useAuthStore((s) => s.user?.name);
  return (
    <div className="space-y-6">
      <PageHeader title={name ? `Hello, ${name.split(" ")[0]}` : "Team Workspace"} description="Your attendance for today and the tasks assigned to you." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4 lg:order-2">
          <ClockCard />
          <MyWorkLocation />
        </div>
        <div className="lg:order-1">
          <MyTasksList />
        </div>
      </div>
    </div>
  );
}
