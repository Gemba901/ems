import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Role } from "@/types/role";
import { Activity, ShieldAlert, RefreshCw, Database, Clock } from "lucide-react";

const PLANNED_ACTIONS = [
  {
    icon: RefreshCw,
    iconBg: "bg-info-subtle",
    iconColor: "text-info",
    title: "Sync Integrations",
    description: "Force sync with external tools",
  },
  {
    icon: Database,
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    title: "Manual Backup",
    description: "Snapshot current database",
  },
  {
    icon: ShieldAlert,
    iconBg: "bg-danger-subtle",
    iconColor: "text-danger",
    title: "Security Policies",
    description: "Update global access rules",
  },
];

export default function OperationsPage() {
  return (
    <ProtectedRoute allowedRoles={[Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD]}>
      <div className="max-w-7xl mx-auto w-full space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-foreground">System Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage integrations, system health, and security logs.</p>
        </div>

        {/* Planned actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANNED_ACTIONS.map(({ icon: Icon, iconBg, iconColor, title, description }) => (
            <div
              key={title}
              className="flex items-center gap-4 p-6 bg-card border border-border rounded-2xl shadow-sm opacity-60 cursor-not-allowed select-none"
            >
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                <Icon className={`h-6 w-6 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-foreground">{title}</p>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Soon</span>
                </div>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Audit log — coming soon */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">System Activity Log</h2>
            <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted px-2.5 py-1 rounded-full">Coming soon</span>
          </div>
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <Clock className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">Activity log is not yet available</p>
            <p className="text-xs text-muted-foreground">System event tracking will be displayed here in a future update.</p>
          </div>
        </div>

      </div>
    </ProtectedRoute>
  );
}