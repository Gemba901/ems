import { Activity } from "lucide-react";

interface HistoryItem {
  role: string;
  description: string;
  date: string;
  isCurrent?: boolean;
}

interface HistoryTimelineProps {
  history: HistoryItem[];
}

export function HistoryTimeline({ history }: HistoryTimelineProps) {
  return (
    <div className="bg-card p-6 rounded-2xl border border-border shadow-sm flex-1">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-bold tracking-widest text-foreground uppercase">Employment History</h3>
      </div>
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[5px] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted before:to-transparent">
        {history.map((item, index) => (
          <div key={index} className="relative flex items-center justify-between group">
            <div className={`flex items-center justify-center w-3 h-3 rounded-full border-2 border-card ${item.isCurrent ? "bg-info" : "bg-muted-foreground"} shadow shrink-0 z-10`} />
            <div className="w-[calc(100%-2rem)] ml-4">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-foreground text-sm">{item.role}</span>
                {item.isCurrent && <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded">Present</span>}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
              <span className="text-[9px] text-muted-foreground font-mono uppercase tracking-wider">{item.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}