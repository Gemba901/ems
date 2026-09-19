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
    <div role="group" aria-label="Assigned tasks view" className="inline-flex h-9 w-[252px] items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
      {([
        ["to-me", "Assigned to me"],
        ["by-me", "Assigned by me"],
      ] as const).map(([view, label]) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          onClick={() => onChange(view)}
          className={`h-full min-w-0 flex-1 rounded-full px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${value === view
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
