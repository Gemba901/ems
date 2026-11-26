"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Loader2 } from "lucide-react";
import {
  DwmsService,
  getDwmsErrorMessage,
  type DwmsEmployeeRoleActivityItem,
  type EmployeeActivityAssignmentStatus,
} from "@/services/dwms.service";
import { DwmsDataField, DwmsMobileDataCard } from "./DwmsResponsive";

type EmployeeActivityManagerProps = {
  employeeId: string;
  accessToken: string;
  canManageActivities: boolean;
  pageSize?: number;
};

type Feedback = { tone: "success" | "error"; text: string } | null;

function scopeLabel(value?: string | null) {
  if (!value) return "Legacy activity";
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function EmployeeActivityManager({
  employeeId,
  accessToken,
  canManageActivities,
  pageSize = 5,
}: EmployeeActivityManagerProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendingDeactivation, setPendingDeactivation] =
    useState<DwmsEmployeeRoleActivityItem | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["dwms-employee-role-activities", employeeId],
    queryFn: () => DwmsService.getEmployeeRoleActivities(accessToken, employeeId),
    enabled: !!accessToken && !!employeeId,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      item,
      status,
    }: {
      item: DwmsEmployeeRoleActivityItem;
      status: EmployeeActivityAssignmentStatus;
    }) =>
      DwmsService.updateEmployeeActivityStatus(
        accessToken,
        employeeId,
        item.activity.id,
        status,
      ),
    onSuccess: (result, variables) => {
      const isDeactivation = variables.status === "INACTIVE";
      const removed = result.removedFutureInstances ?? 0;
      setFeedback({
        tone: "success",
        text: isDeactivation
          ? `Deactivated “${variables.item.activity.name}”. Removed ${removed} not-started future task ${removed === 1 ? "instance" : "instances"}; existing history was preserved.`
          : `Activated “${variables.item.activity.name}”. Future routine work is enabled.`,
      });
      setPendingDeactivation(null);
      void queryClient.invalidateQueries({
        queryKey: ["dwms-employee-profile", employeeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["dwms-employee-role-activities", employeeId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["calendar-employee-stats", employeeId],
      });
    },
    onError: (mutationError) => {
      setFeedback({
        tone: "error",
        text: getDwmsErrorMessage(mutationError, "Failed to update employee activity"),
      });
    },
  });

  const items = data?.activities ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = items.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const updateStatus = (
    item: DwmsEmployeeRoleActivityItem,
    status: EmployeeActivityAssignmentStatus,
  ) => {
    setFeedback(null);
    statusMutation.mutate({ item, status });
  };

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 rounded-xl bg-info-subtle p-2 text-info">
              <Activity className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Applicable Activities</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Current scoped activities and previously assigned activity history.
              </p>
            </div>
          </div>
          {data?.count !== undefined && (
            <span className="w-fit rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {data.count} activities
            </span>
          )}
        </div>

        {feedback && (
          <div
            className={`mx-4 mt-4 rounded-xl border p-3 text-xs ${
              feedback.tone === "error"
                ? "border-danger bg-danger-subtle text-danger"
                : "border-success bg-success-subtle text-success"
            }`}
            role="status"
          >
            {feedback.text}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading activities...
          </div>
        ) : error ? (
          <div className="m-4 rounded-xl border border-danger bg-danger-subtle p-4 text-sm text-danger">
            {getDwmsErrorMessage(error, "Failed to load employee activities")}
          </div>
        ) : !items.length ? (
          <div className="m-4 rounded-xl border border-dashed border-border bg-muted p-8 text-center text-sm text-muted-foreground">
            No RTM activities apply to this employee yet.
          </div>
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {paginatedItems.map((item) => {
              const { activity, status } = item;
              const isUpdating = statusMutation.isPending && statusMutation.variables?.item.activity.id === activity.id;
              return (
                <DwmsMobileDataCard key={activity.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-foreground">{activity.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{activity.code}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status === "ACTIVE" ? "bg-success-subtle text-success" : "bg-muted text-muted-foreground"}`}>
                      {status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
                    <DwmsDataField label="Scope">{scopeLabel(activity.scope)}</DwmsDataField>
                    <DwmsDataField label="Frequency">{String(activity.frequency).replaceAll("_", " ")}</DwmsDataField>
                  </div>
                  {canManageActivities && activity.status !== "ARCHIVED" ? (
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={isUpdating}
                      onClick={() => status === "ACTIVE" ? setPendingDeactivation(item) : updateStatus(item, "ACTIVE")}
                      className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-60 ${status === "ACTIVE" ? "bg-muted text-foreground" : "bg-info text-info-foreground"}`}
                    >
                      {isUpdating && <Loader2 className="h-4 w-4 animate-spin" />}
                      {status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </Button>
                  ) : null}
                </DwmsMobileDataCard>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-full divide-y divide-border text-sm">
              <TableHeader className="bg-muted text-left text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <TableRow>
                  <TableHead className="px-5 py-3">Process</TableHead>
                  <TableHead className="px-5 py-3">Scope</TableHead>
                  <TableHead className="px-5 py-3">Frequency</TableHead>
                  <TableHead className="px-5 py-3">Status</TableHead>
                  <TableHead className="px-5 py-3 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {paginatedItems.map((item) => {
                  const { activity, status } = item;
                  const isUpdating =
                    statusMutation.isPending &&
                    statusMutation.variables?.item.activity.id === activity.id;
                  return (
                    <TableRow key={activity.id} className="align-top">
                      <TableCell className="px-5 py-4">
                        <p className="font-semibold text-foreground">{activity.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{activity.code}</p>
                        {activity.status === "ARCHIVED" && (
                          <span className="mt-2 inline-flex rounded-full bg-warning-subtle px-2 py-0.5 text-[10px] font-bold uppercase text-warning">
                            Master archived
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        <p>{scopeLabel(activity.scope)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {activity.scopeTarget || "All applicable employees"}
                        </p>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-muted-foreground">
                        {String(activity.frequency).replaceAll("_", " ")}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            status === "ACTIVE"
                              ? "bg-success-subtle text-success"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-right">
                        {canManageActivities && activity.status !== "ARCHIVED" ? (
                          <Button
                            variant="ghost"
                            type="button"
                            disabled={isUpdating}
                            onClick={() => {
                              if (status === "ACTIVE") setPendingDeactivation(item);
                              else updateStatus(item, "ACTIVE");
                            }}
                            className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                              status === "ACTIVE"
                                ? "bg-muted text-foreground hover:bg-muted"
                                : "bg-info text-info-foreground hover:bg-info"
                            }`}
                          >
                            {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {status === "ACTIVE" ? "Deactivate" : "Activate"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unavailable</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}

        {items.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-border bg-muted px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, items.length)} of {items.length} activities
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>

      {pendingDeactivation && (
        <Dialog open onOpenChange={(open) => { if (!open && !statusMutation.isPending) setPendingDeactivation(null); }}>
          <DialogContent showCloseButton={!statusMutation.isPending} className="sm:max-w-md">
            <DialogHeader className="pr-8">
              <DialogTitle>Deactivate this activity?</DialogTitle>
              <DialogDescription>
                <strong>{pendingDeactivation.activity.name}</strong> will stop generating routine work for this employee. Not-started task instances scheduled after today will be deleted. Today’s work and existing history will be preserved.
              </DialogDescription>
            </DialogHeader>
            {feedback?.tone === "error" && <p role="alert" className="text-danger">{feedback.text}</p>}
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => setPendingDeactivation(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => updateStatus(pendingDeactivation, "INACTIVE")}
                className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground hover:bg-danger/90 disabled:opacity-50"
              >
                {statusMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Deactivate
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
