"use client";

export type CreateFlowType = "EVENT" | "CLIENT_VISIT" | "VISIT" | "REQUEST" | "BLOCK";

const ALL_TABS: { key: CreateFlowType; label: string; adminOnly?: boolean; nonAdminOnly?: boolean }[] = [
  { key: "EVENT", label: "Event" },
  { key: "CLIENT_VISIT", label: "New Client Visit", adminOnly: true },
  { key: "VISIT", label: "Partner Visit", adminOnly: true },
  { key: "REQUEST", label: "Request a Visit", nonAdminOnly: true },
  { key: "BLOCK", label: "Out of Office", adminOnly: true },
];

export function CreateTypeTabs({
  active, isAdmin, adminOrgConfigured, onSelect,
}: {
  active: CreateFlowType;
  isAdmin: boolean;
  adminOrgConfigured: boolean;
  onSelect: (type: CreateFlowType) => void;
}) {
  const tabs = ALL_TABS.filter(t => {
    if ((t.adminOnly || t.nonAdminOnly) && !adminOrgConfigured) return false;
    if (t.adminOnly && !isAdmin) return false;
    if (t.nonAdminOnly && isAdmin) return false;
    return true;
  });

  if (tabs.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-4">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(t.key)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            active === t.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
