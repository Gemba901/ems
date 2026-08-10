"use client";

import { ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The Task/TaskInstance models (packages/db/prisma/schema.prisma) are
// generic DWMS-style tasks assigned to an Employee — they carry no
// reference to a steel process, plan, or record, so there is nothing real
// to show here yet. Left as an explicit empty state rather than forcing a
// link that doesn't exist.
export function TodaysTasks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-400" />
          Today&apos;s Tasks
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
          <p className="text-sm text-slate-500">No steel-linked tasks yet.</p>
          <p className="text-[11px] text-slate-400">
            Available once steel processes can assign tasks to employees.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
