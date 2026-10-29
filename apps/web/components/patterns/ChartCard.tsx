"use client";
import { useId } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { SectionCard } from "./PageSection";
import { LoadingState } from "./LoadingState";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
export interface ChartSeries {
  key: string;
  label: string;
  token: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";
}
export interface ChartCardProps {
  title: string;
  description?: string;
  data: Record<string, string | number>[];
  categoryKey: string;
  series: ChartSeries[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}
export function ChartCard({
  title,
  description,
  data,
  categoryKey,
  series,
  loading,
  error,
  onRetry,
}: ChartCardProps) {
  const id = useId();
  return (
    <SectionCard title={title} description={description}>
      {loading ? (
        <LoadingState label="Loading chart…" />
      ) : error ? (
        <ErrorState description={error} onRetry={onRetry} />
      ) : !data.length ? (
        <EmptyState title="No chart data" />
      ) : (
        <>
          <div className="h-64 min-w-0" aria-hidden="true">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={{ width: 320, height: 256 }}
            >
              <BarChart data={data} accessibilityLayer={false}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey={categoryKey} stroke="var(--muted-foreground)" />
                <YAxis stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    borderColor: "var(--border)",
                  }}
                />
                {series.map((s) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={`var(--${s.token})`}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details>
            <summary
              className="cursor-pointer text-body underline"
              aria-controls={id}
            >
              View chart data
            </summary>
            <div className="overflow-x-auto">
              <table id={id} className="w-full text-body">
                <caption className="sr-only">{title} data</caption>
                <thead>
                  <tr>
                    <th scope="col" className="p-2 text-left">
                      Category
                    </th>
                    {series.map((s) => (
                      <th scope="col" className="p-2 text-left" key={s.key}>
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i}>
                      <th scope="row" className="p-2 text-left">
                        {row[categoryKey]}
                      </th>
                      {series.map((s) => (
                        <td key={s.key} className="p-2">
                          {row[s.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </SectionCard>
  );
}
