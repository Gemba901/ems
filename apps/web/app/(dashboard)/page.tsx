"use client";

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
    { title: "Time & Attendance", description: "Log hours, view shifts & request leave", icon: CalendarClock, color: "text-blue-600", bg: "bg-blue-50", border: "hover:border-blue-200" },
    { title: "Payroll & Finance", description: "Access payslips, tax forms & expenses", icon: Receipt, color: "text-emerald-600", bg: "bg-emerald-50", border: "hover:border-emerald-200" },
    { title: "Document Center", description: "Secure contracts & compliance files", icon: FolderLock, color: "text-purple-600", bg: "bg-purple-50", border: "hover:border-purple-200" },
    { title: "Feedback Hub", description: "Submit suggestions & anonymous reports", icon: MessageSquareText, color: "text-orange-600", bg: "bg-orange-50", border: "hover:border-orange-200" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      
      {/* 1. HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome back, {user?.name}.</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <Target className="h-4 w-4" />
            {today}
          </p>
        </div>
        
      </div>

      {/* 2. TOP METRICS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* 3. BENTO BOX MAIN LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Meetings & Actions */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-400" /> Next Performance Meetings
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {meetings.map((meeting) => (
                  <div key={meeting.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-10 w-10 border border-slate-200">
                        <AvatarFallback className="bg-slate-100 text-slate-600 text-xs">{meeting.user.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{meeting.title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">with {meeting.user} • {meeting.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900">{meeting.time}</p>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center justify-end gap-1">
                          {meeting.isVideo ? <Video className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {meeting.duration}
                        </p>
                      </div>
                      <button className="text-slate-400 hover:text-slate-600"><MoreVertical className="h-5 w-5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 pb-4 flex flex-row items-center justify-between">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-slate-400" /> Latest Development Actions
              </CardTitle>
              <button className="text-sm text-blue-600 font-medium hover:underline">View All</button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {actions.map((action) => (
                  <div key={action.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{action.title}</h4>
                      <p className="text-xs text-slate-500 mt-1">Owner: <span className="font-medium text-slate-700">{action.owner}</span></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {action.priority === 'High' && <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-transparent shadow-none">High Priority</Badge>}
                      {action.status === 'Completed' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-transparent shadow-none hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1"/> Completed</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-600 bg-white shadow-none">{action.status}</Badge>
                      )}
                      <span className="text-xs font-medium text-slate-500 w-20 text-right">Due: {action.due}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT COLUMN: Task Hub */}
        <div className="xl:col-span-1">
          <Card className="border-slate-200 shadow-sm h-full flex flex-col">
            <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50 rounded-t-xl">
              <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" /> Task Hub
              </CardTitle>
              <p className="text-xs text-slate-500 mt-1">Your performance To-Dos</p>
            </CardHeader>
            <CardContent className="p-4 flex-1 overflow-y-auto">
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="p-4 border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group bg-white">
                    <div className="flex items-start justify-between mb-2">
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md ${task.tagColor}`}>
                        {task.tag}
                      </span>
                      <MoreVertical className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h4 className="text-sm font-semibold text-slate-800 leading-snug">{task.title}</h4>
                    
                    <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100">
                      {task.comments > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <MessageSquare className="h-3.5 w-3.5" /> {task.comments}
                        </span>
                      )}
                      {task.attachments > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Paperclip className="h-3.5 w-3.5" /> {task.attachments}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-medium text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                + Create New Task
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 4. SYSTEM MODULES GRID (NEW) */}
      <section className="pt-4 border-t border-slate-200">
        <h2 className="text-lg font-bold text-slate-900 mb-4">System Modules</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {systemModules.map((module) => (
            <Card 
              key={module.title} 
              className={`group cursor-pointer transition-all duration-200 hover:shadow-md border-slate-200 ${module.border}`}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

    </div>
  );
}