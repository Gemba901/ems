"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ErrorState } from "@/components/patterns/ErrorState";
import { LoadingState } from "@/components/patterns/LoadingState";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { DwmsService, getDwmsErrorMessage, type DwmsAlertListTab } from "@/services/dwms.service";
import { useAuthStore } from "@/store/auth.store";
import DwmsTabHeader, { type DwmsTabItem } from "./DwmsTabHeader";

const MANAGEMENT_ROLES = new Set(["MANAGEMENT", "SUPER_ADMIN", "ADMIN", "HR"]);

const alertTabs: DwmsTabItem<DwmsAlertListTab>[] = [
  { key: "MY_ALERTS", label: "My Alerts", dotColor: "bg-info" },
  { key: "TEAM_ALERTS", label: "My Team's Alerts", dotColor: "bg-info" },
  { key: "DEPARTMENTAL", label: "Department Alerts", dotColor: "bg-warning" },
  { key: "ORGANISATIONAL", label: "Organization Alerts", dotColor: "bg-success" },
  { key: "OPENED_BY_ME", label: "Opened by Me" },
];

const abnormalityTabs: DwmsTabItem<DwmsAlertListTab>[] = [
  { key: "MY_ABNORMALITIES", label: "My Abnormalities", dotColor: "bg-danger" },
  { key: "TEAM_ABNORMALITIES", label: "My Team's Abnormalities", dotColor: "bg-warning" },
];

const severityOptions = [
  { value: "ALL", label: "All severities" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export function AlertRegister({ kind }: { kind: "alerts" | "abnormalities" }) {
  const { accessToken, user } = useAuthStore();
  const isAbnormality = kind === "abnormalities";
  const title = isAbnormality ? "Abnormalities" : "Alerts";
  const defaultTab: DwmsAlertListTab = isAbnormality ? "MY_ABNORMALITIES" : "MY_ALERTS";
  const [view, setView] = useState<{ tab: DwmsAlertListTab; page: number }>({ tab: defaultTab, page: 1 });
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("ALL");
  const identity = [user?.organizationId, user?.userId];
  const capabilities = useQuery({
    queryKey: ["rtm-alert-capabilities", ...identity],
    queryFn: () => DwmsService.getAccessCapabilities(accessToken!),
    enabled: !!accessToken,
  });
  const access = capabilities.data;
  const team = MANAGEMENT_ROLES.has(String(user?.roleLevel ?? "").toUpperCase()) || access?.hasReportees;
  const tabs = (isAbnormality ? abnormalityTabs : alertTabs).filter(({ key }) => {
    if (key === "TEAM_ALERTS" || key === "TEAM_ABNORMALITIES") return team;
    if (key === "DEPARTMENTAL") return access?.alertViewLevel === "DEPARTMENT" || access?.alertViewLevel === "ORGANIZATION";
    if (key === "ORGANISATIONAL") return access?.alertViewLevel === "ORGANIZATION";
    return true;
  });
  const { tab, page } = tabs.some(({ key }) => key === view.tab) ? view : { tab: defaultTab, page: 1 };
  const results = useQuery({
    queryKey: ["rtm-alert-register", ...identity, tab, page, search, severity],
    queryFn: () => DwmsService.getAlerts(accessToken!, { tab, page, limit: 20, search, severity }),
    enabled: !!accessToken,
  });
  const alerts = results.data?.alerts ?? [];
  const pages = results.data?.pagination?.pages ?? 0;
  const visiblePage = pages > 0 ? Math.min(page, pages) : page;
  const formatDate = new Intl.DateTimeFormat("en-US", {
    timeZone: user?.organizationTimeZone || "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 space-y-section px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title={title}
        actions={!isAbnormality && <Link href="/dwms/actions/new?mode=alert" className={buttonVariants()}>Raise New Alert</Link>}
      />
      <DwmsTabHeader activeTab={tab} onTabChange={(next) => setView({ tab: next, page: 1 })} tabs={tabs} />
      <div role="search" aria-label={`Filter ${kind}`} className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label={`Search ${kind}`}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setView({ tab, page: 1 }); }}
          placeholder={`Search ${kind}…`}
          className="min-h-10 min-w-40 flex-1"
        />
        <NativeSelect
          value={severity}
          aria-label="Severity"
          onChange={(event) => { setSeverity(event.target.value); setView({ tab, page: 1 }); }}
          className="min-h-10"
        >
          {severityOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </NativeSelect>
      </div>
      {capabilities.error && (
        <ErrorState title="Unable to load access settings" description={getDwmsErrorMessage(capabilities.error, "Please try again.")} onRetry={() => void capabilities.refetch()} />
      )}
      {results.isLoading ? (
        <LoadingState label={`Loading ${kind}…`} />
      ) : results.error ? (
        <ErrorState title={`Unable to load ${kind}`} description={getDwmsErrorMessage(results.error, "Please try again.")} onRetry={() => void results.refetch()} />
      ) : alerts.length === 0 ? (
        <EmptyState title={`No ${kind} found in this section`} />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {alerts.map((alert) => {
            const showResponsible = tab === "TEAM_ALERTS" || tab === "OPENED_BY_ME" || tab === "TEAM_ABNORMALITIES";
            const person = showResponsible ? alert.responsibleEmployee : alert.raisedBy;
            const personLabel = showResponsible ? "Responsible" : "Raised by";
            return (
              <li key={alert.id}>
                <Link href={`/dwms/alerts/${alert.id}`} className="block min-w-0 space-y-2 px-4 py-3 transition hover:bg-muted focus-visible:outline-ring sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {isAbnormality && <Badge variant="danger">Abnormality</Badge>}
                    <Badge variant={alert.severity === "CRITICAL" ? "danger" : alert.severity === "HIGH" ? "warning" : "info"}>{alert.severity}</Badge>
                    {(isAbnormality || alert.raiseCount === 2) && <Badge variant="neutral">{isAbnormality ? `Raised ${alert.raiseCount} times` : "Raised twice"}</Badge>}
                    {alert.responsibleEmployee && (
                      <Badge variant={alert.pendingAcknowledgments ? "warning" : "success"}>
                        {alert.pendingAcknowledgments ? `${alert.pendingAcknowledgments} Not Acknowledged` : "Acknowledged"}
                      </Badge>
                    )}
                    <time className="text-caption text-muted-foreground sm:ml-auto" dateTime={alert.updatedAt ?? alert.createdAt}>
                      {formatDate.format(new Date(alert.updatedAt ?? alert.createdAt))}
                    </time>
                  </div>
                  <h2 className="break-words font-semibold">{alert.title}</h2>
                  <p className="line-clamp-2 break-words text-body text-muted-foreground">{alert.description}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
                    {person && <span>{personLabel}: {person.name}</span>}
                    {!isAbnormality && alert.department && <span>Department: {alert.department.name}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav aria-label={`${title} pages`} className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" disabled={visiblePage <= 1} onClick={() => setView({ tab, page: visiblePage - 1 })}>Previous</Button>
          <span className="text-caption text-muted-foreground">Page {visiblePage} of {pages}</span>
          <Button type="button" variant="outline" disabled={visiblePage >= pages} onClick={() => setView({ tab, page: visiblePage + 1 })}>Next</Button>
        </nav>
      )}
    </div>
  );
}
