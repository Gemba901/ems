import type { ReactNode } from "react";
import {
  PageHeader,
  type PageHeaderProps,
} from "@/components/patterns/PageHeader";
import {
  DetailList,
  type DetailListProps,
} from "@/components/patterns/DetailList";
import { Timeline, type TimelineItem } from "@/components/patterns/Timeline";
import { StatusBadge } from "@/components/patterns/StatusBadge";
import { SectionCard } from "@/components/patterns/SectionCard";
export interface DetailPageTemplateProps {
  header: PageHeaderProps;
  status?: string | null;
  statusLabel?: string;
  children: ReactNode;
  details?: DetailListProps["items"];
  activity?: TimelineItem[];
  sidebar?: ReactNode;
  sidebarLabel?: string;
}
export function DetailPageTemplate({
  header,
  status,
  statusLabel,
  children,
  details,
  activity,
  sidebar,
  sidebarLabel = "Record information",
}: DetailPageTemplateProps) {
  const hasSidebar =
    details !== undefined || activity !== undefined || sidebar != null;
  return (
    <div
      data-slot="detail-page-template"
      className="min-w-0 space-y-section text-body"
    >
      <PageHeader {...header} />
      {status !== undefined && (
        <StatusBadge status={status} label={statusLabel} />
      )}
      <div
        className={
          hasSidebar
            ? "grid min-w-0 gap-section lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
            : "min-w-0"
        }
      >
        <div className="min-w-0 space-y-section">{children}</div>
        {hasSidebar && (
          <aside aria-label={sidebarLabel} className="min-w-0 space-y-section">
            {details !== undefined && (
              <SectionCard title="Details">
                <DetailList items={details} />
              </SectionCard>
            )}
            {activity !== undefined && (
              <SectionCard title="Activity">
                <Timeline items={activity} />
              </SectionCard>
            )}
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
