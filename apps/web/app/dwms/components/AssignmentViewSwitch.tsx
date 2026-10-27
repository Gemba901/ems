"use client";

export type AssignmentView = "to-me" | "by-me";

export default function AssignmentViewSwitch({
  value,
  onChange,
}: {
  value: AssignmentView;
  onChange: (view: AssignmentView) => void;
}) {
  return (
    <div role="group" aria-label="Assigned tasks view" className="inline-flex min-h-11 w-full items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-[252px] sm:rounded-full">
      {([
        ["to-me", "Assigned to me"],
        ["by-me", "Assigned by me"],
      ] as const).map(([view, label]) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={`min-h-9 min-w-0 flex-1 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:rounded-full ${value === view
            ? "bg-indigo-600 text-white"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
