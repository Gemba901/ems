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
    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex-1">
      <div className="flex items-center gap-2 mb-6">
        <Activity className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold tracking-widest text-slate-800 uppercase">Employment History</h3>
      </div>
      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-[5px] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
        {history.map((item, index) => (
          <div key={index} className="relative flex items-center justify-between group">
            <div className={`flex items-center justify-center w-3 h-3 rounded-full border-2 border-white ${item.isCurrent ? "bg-blue-600" : "bg-slate-300"} shadow shrink-0 z-10`} />
            <div className="w-[calc(100%-2rem)] ml-4">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-900 text-sm">{item.role}</span>
                {item.isCurrent && <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded">Present</span>}
              </div>
              <p className="text-xs text-slate-500 mb-2">{item.description}</p>
              <span className="text-[9px] text-slate-400 font-mono uppercase tracking-wider">{item.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}