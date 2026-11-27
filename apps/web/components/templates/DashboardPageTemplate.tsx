"use client";
import type { ReactNode } from "react";
import {
  PageHeader,
  type PageHeaderProps,
} from "@/components/patterns/PageHeader";
import { StatCard, type StatCardProps } from "@/components/patterns/StatCard";
import {
  ChartCard,
  type ChartCardProps,
} from "@/components/patterns/ChartCard";
import { LoadingState } from "@/components/patterns/LoadingState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { EmptyState } from "@/components/patterns/EmptyState";
export interface DashboardPageTemplateProps {
  header: PageHeaderProps;
  stats: (StatCardProps & { id: string })[];
  charts: (ChartCardProps & { id: string })[];
  children?: ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}
export function DashboardPageTemplate({
  header,
  stats,
  charts,
  children,
  loading,
  error,
  onRetry,
}: DashboardPageTemplateProps) {
  return (
    <div
      data-slot="dashboard-page-template"
      className="min-w-0 space-y-section text-body"
    >
      <PageHeader {...header} />
      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : error ? (
        <ErrorState description={error} onRetry={onRetry} />
      ) : (
        <>
          {stats.length > 0 && (
            <section
              aria-label="Key metrics"
              className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4"
            >
              {stats.map(({ id, ...stat }) => (
                <StatCard key={id} {...stat} />
              ))}
            </section>
          )}
          {charts.length > 0 && (
            <section
              aria-label="Charts"
              className="grid min-w-0 gap-section lg:grid-cols-2"
            >
              {charts.map(({ id, ...chart }) => (
                <div key={id} className="min-w-0">
                  <ChartCard {...chart} />
                </div>
              ))}
            </section>
          )}
          {!stats.length && !charts.length && children == null && (
            <EmptyState title="No dashboard data" />
          )}
          {children}
        </>
      )}
    </div>
  );
}
