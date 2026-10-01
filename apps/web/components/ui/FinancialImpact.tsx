import Link from "next/link";

// One row per kaizen / SGA. Amounts are plain numbers; null means "not recorded".
export interface FinancialEntry {
  id: string;
  title: string;
  department: string;
  currency: string;
  benefit: number | null;
  cost: number | null;
}

function formatMoney(amount: number, currency: string) {
  if (!currency) return Math.round(amount).toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function toAmount(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Totals are kept per currency: amounts in different currencies are never added together.
export function FinancialImpact({
  entries,
  benefitLabel,
  benefitDetail,
  costLabel,
  costDetail,
  linkBase,
  emptyText,
}: {
  entries: FinancialEntry[];
  benefitLabel: string;
  benefitDetail: string;
  costLabel: string;
  costDetail: string;
  linkBase: string;
  emptyText: string;
}) {
  const byCurrency = new Map<string, { benefit: number; cost: number; withBenefit: number; withCost: number }>();
  for (const e of entries) {
    if (e.benefit == null && e.cost == null) continue;
    const row = byCurrency.get(e.currency) ?? { benefit: 0, cost: 0, withBenefit: 0, withCost: 0 };
    if (e.benefit != null) { row.benefit += e.benefit; row.withBenefit += 1; }
    if (e.cost != null) { row.cost += e.cost; row.withCost += 1; }
    byCurrency.set(e.currency, row);
  }
  const currencies = [...byCurrency.entries()].sort((a, b) => b[1].benefit - a[1].benefit);
  const top = entries
    .filter((e) => e.benefit != null && e.benefit > 0)
    .sort((a, b) => b.benefit! - a.benefit!)
    .slice(0, 5);

  if (currencies.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-5">
      {currencies.map(([currency, t]) => {
        const net = t.benefit - t.cost;
        return (
          <div key={currency}>
            {currencies.length > 1 && <p className="mb-2 text-xs font-semibold text-slate-500">{currency || "No currency recorded"}</p>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label={benefitLabel} value={formatMoney(t.benefit, currency)} detail={`${benefitDetail} · ${t.withBenefit} recorded`} tone="text-emerald-700" />
              <Tile label={costLabel} value={formatMoney(t.cost, currency)} detail={`${costDetail} · ${t.withCost} recorded`} />
              <Tile
                label="Net impact"
                value={formatMoney(net, currency)}
                detail="Benefit minus cost"
                tone={net >= 0 ? "text-emerald-700" : "text-rose-600"}
              />
              <Tile
                label="Return"
                value={t.cost > 0 ? `${(t.benefit / t.cost).toFixed(1)}×` : "—"}
                detail="Benefit for every 1 spent"
              />
            </div>
          </div>
        );
      })}

      {top.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">Biggest benefits</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {top.map((e) => (
              <li key={e.id}>
                <Link href={`${linkBase}/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{e.title}</span>
                    <span className="block truncate text-xs text-slate-500">{e.department}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">{formatMoney(e.benefit!, e.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, detail, tone = "text-slate-900" }: { label: string; value: string; detail: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`my-1 truncate text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}
