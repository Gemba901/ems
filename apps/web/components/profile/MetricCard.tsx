export const MetricCard = ({ title, value, progress, colorClass }: { title: string; value: string | number; progress: number; colorClass: string }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between h-36">
    <div className="text-[9px] uppercase tracking-widest text-slate-400 font-mono">{title}</div>
    <div>
      <div className="text-4xl font-bold text-slate-900 mb-2">{value}</div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} transition-all duration-500`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  </div>
);