"use client";

import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  FileEdit,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Target,
  TrendingUp,
  Video,
  CalendarClock,
  Receipt,
  FolderLock,
  MessageSquareText
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/store/auth.store";



export default function EnterpriseDashboardPage() {

  const user = useAuthStore((state) => state.user);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const metrics = {
    activeReviews: 5,
    pendingTasks: 12,
    goalProgress: 75,
  };

  const meetings = [
    { id: 1, title: "Q3 Performance Sync", user: "Sarah Jenkins", role: "Fleet Manager", time: "Today, 2:00 PM", duration: "45m", isVideo: true },
    { id: 2, title: "Goal Setting Q4", user: "David Okafor", role: "Operations Lead", time: "Tomorrow, 10:00 AM", duration: "30m", isVideo: false },
  ];

  const actions = [
    { id: 1, title: "Year-End Self Evaluation", owner: "Marcus Thorne", status: "In Progress", due: "Nov 15", priority: "High" },
    { id: 2, title: "Peer Review: Logistics Team", owner: "Marcus Thorne", status: "Pending", due: "Nov 18", priority: "Medium" },
    { id: 3, title: "Update Q3 KPIs", owner: "Sarah Jenkins", status: "Completed", due: "Nov 10", priority: "Low" },
  ];

  const tasks = [
    { id: 1, title: "Finalize driver safety metrics", tag: "Critical", tagColor: "bg-red-100 text-red-700", comments: 3, attachments: 1 },
    { id: 2, title: "Approve Q3 bonus allocations", tag: "Finance", tagColor: "bg-blue-100 text-blue-700", comments: 0, attachments: 2 },
    { id: 3, title: "Draft performance improvement plan", tag: "HR", tagColor: "bg-purple-100 text-purple-700", comments: 5, attachments: 0 },
    { id: 4, title: "Review monthly fuel efficiency", tag: "Routine", tagColor: "bg-slate-100 text-slate-700", comments: 1, attachments: 0 },
  ];

  const systemModules = [
    { title: "Time & Attendance", description: "Log hours, view shifts & request leave", icon: CalendarClock, color: "text-blue-600", bg: "bg-blue-50", border: "hover:border-blue-200", href: null },
    { title: "Payroll & Finance", description: "Access payslips, tax forms & expenses", icon: Receipt, color: "text-emerald-600", bg: "bg-emerald-50", border: "hover:border-emerald-200", href: null },
    { title: "Document Center", description: "Secure contracts & compliance files", icon: FolderLock, color: "text-purple-600", bg: "bg-purple-50", border: "hover:border-purple-200", href: null },
    { title: "Suggestions & Ideas", description: "Submit ideas and track their progress", icon: MessageSquareText, color: "text-orange-600", bg: "bg-orange-50", border: "hover:border-orange-200", href: "/sims" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back, {user?.name}.</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Target className="h-4 w-4" />
            {today}
          </p>
        </div>
        
      </div>

      {/* metrics cards */}
      {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Reviews</p>
              <h2 className="text-3xl font-bold text-slate-900 mt-2">{metrics.activeReviews}</h2>
            </div>
            <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <FileEdit className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Pending Tasks</p>
              <h2 className="text-3xl font-bold text-slate-900 mt-2">{metrics.pendingTasks}</h2>
            </div>
            <div className="h-12 w-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center">
              <Clock className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6 flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">Goal Progress</p>
              <span className="text-sm font-bold text-emerald-600">{metrics.goalProgress}%</span>
            </div>
            <Progress value={metrics.goalProgress} className="h-2 bg-slate-100" />
          </CardContent>
        </Card>
      </div> */}

      
      {/* system modules */}
      <section className="pt-4 border-t border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">System Modules</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {systemModules.map((module) => {
            const card = (
              <Card
                key={module.title}
                className={`group cursor-pointer transition-all duration-200 hover:shadow-md border-slate-200 ${module.border} ${module.href ? "" : "opacity-60 cursor-not-allowed"}`}
              >
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={`shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-xl ${module.bg} transition-colors`}>
                    <module.icon className={`h-6 w-6 ${module.color}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                      {module.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {module.description}
                    </p>
                    {!module.href && <span className="text-[10px] text-slate-400 font-medium mt-1 block">Coming soon</span>}
                  </div>
                </CardContent>
              </Card>
            );
            return module.href ? (
              <Link key={module.title} href={module.href}>{card}</Link>
            ) : (
              <div key={module.title}>{card}</div>
            );
          })}
        </div>
      </section>

    </div>
  );
}