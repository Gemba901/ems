"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { readAssets } from "../asset-preview";
import {
  createInspectionSnapshot,
  inspectionPreviewSchema,
  readInspectionPreview,
} from "../inspections/inspection-preview";
import {
  createWorkOrder,
  readWorkOrders,
  workOrderSchema,
} from "../work-orders/work-order-preview";
import { emptyWorkOrder } from "../work-orders/work-order-types";
import {
  buildOccurrences,
  createPlan,
  planningSchema,
  planningToday,
  readPlanning,
  setPlanStatus as changePlanStatus,
  updatePlan,
  type MaintenancePlan,
  type PlanInput,
  type PlanOccurrence,
  type PlanningData,
} from "./planning-preview";

type PlanningContextValue = {
  plans: MaintenancePlan[];
  occurrences: PlanOccurrence[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  savePlan: (
    input: PlanInput,
    id?: string,
    activate?: boolean,
    expectedUpdatedAt?: string,
  ) => MaintenancePlan;
  setPlanStatus: (id: string, status: MaintenancePlan["status"]) => void;
  generateJobs: (fromDate: string, toDate: string, planId?: string) => number;
  startJob: (id: string) => { href: string };
  skipJob: (id: string, reason: string) => void;
};
const PlanningContext = createContext<PlanningContextValue | null>(null);

export function MaintenancePlansProvider({
  children,
}: {
  children: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const scope = `${user?.organizationId ?? "none"}:${user?.userId ?? "none"}`;
  const storageKey = `gemba:tpm-planning-preview:v1:${scope}`;
  const queryKey = ["tpm-planning-preview", storageKey];
  const assetKey = `gemba:tpm-assets-preview:v1:${scope}`;
  const inspectionKey = `gemba:tpm-inspections-preview:v1:${scope}`;
  const orderKey = `gemba:tpm-work-orders-preview:v1:${scope}`;
  const query = useQuery({
    queryKey,
    queryFn: async () => readPlanning(storageKey),
    enabled: !!user,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === storageKey || event.key === null)
        void client.invalidateQueries({
          queryKey: ["tpm-planning-preview", storageKey],
        });
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client, storageKey]);

  function latest() {
    if (!user) throw new Error("Sign in before updating maintenance plans.");
    const saved = readPlanning(storageKey);
    const cached = client.getQueryData<PlanningData>(queryKey);
    if (cached && JSON.stringify(saved) !== JSON.stringify(cached)) {
      void client.invalidateQueries({ queryKey });
      throw new Error(
        "Maintenance planning changed in another tab. Reload the latest records before saving.",
      );
    }
    return saved;
  }
  function write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      throw new Error(
        "This browser could not save the preview. Free some browser storage and try again.",
      );
    }
  }
  function persist(data: PlanningData) {
    const clean = planningSchema.parse(data);
    write(storageKey, clean);
    client.setQueryData(queryKey, clean);
  }
  function nowAfter(value?: string) {
    return new Date(
      Math.max(Date.now(), value ? new Date(value).getTime() + 1 : 0),
    ).toISOString();
  }
  function savePlan(
    input: PlanInput,
    id?: string,
    activate = false,
    expectedUpdatedAt?: string,
  ) {
    const data = latest();
    const current = id ? data.plans.find((plan) => plan.id === id) : undefined;
    if (id && !current)
      throw new Error("This maintenance plan is no longer available.");
    if (current && expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt)
      throw new Error(
        "This plan changed while you were editing. Reopen the latest plan before saving.",
      );
    const assets = readAssets(assetKey);
    const checklists = readInspectionPreview(inspectionKey).checklists;
    const status = activate ? "Active" : (current?.status ?? "Draft");
    const saved = current
      ? updatePlan(
          current,
          input,
          assets,
          checklists,
          status,
          nowAfter(current.updatedAt),
        )
      : createPlan(input, assets, checklists, data.plans, status);
    persist({
      ...data,
      plans: current
        ? data.plans.map((plan) => (plan.id === id ? saved : plan))
        : [saved, ...data.plans],
    });
    return saved;
  }
  function setPlanStatus(id: string, status: MaintenancePlan["status"]) {
    const data = latest();
    const current = data.plans.find((plan) => plan.id === id);
    if (!current)
      throw new Error("This maintenance plan is no longer available.");
    const saved =
      status === "Active"
        ? updatePlan(
            current,
            current,
            readAssets(assetKey),
            readInspectionPreview(inspectionKey).checklists,
            status,
            nowAfter(current.updatedAt),
          )
        : changePlanStatus(current, status, nowAfter(current.updatedAt));
    persist({
      ...data,
      plans: data.plans.map((plan) => (plan.id === id ? saved : plan)),
    });
  }
  function generateJobs(fromDate: string, toDate: string, planId?: string) {
    const data = latest();
    if (planId && !data.plans.some((plan) => plan.id === planId))
      throw new Error("This maintenance plan is no longer available.");
    const added: PlanOccurrence[] = [];
    for (const plan of data.plans) {
      if (plan.status !== "Active" || (planId && plan.id !== planId)) continue;
      added.push(
        ...buildOccurrences(plan, fromDate, toDate, [
          ...data.occurrences,
          ...added,
        ]),
      );
    }
    if (data.occurrences.length + added.length > 20000)
      throw new Error(
        "This preview supports up to 20,000 scheduled jobs. Generate a smaller date range.",
      );
    if (added.length)
      persist({ ...data, occurrences: [...data.occurrences, ...added] });
    return added.length;
  }
  function startJob(id: string) {
    const data = latest();
    const occurrence = data.occurrences.find((item) => item.id === id);
    if (!occurrence)
      throw new Error("This scheduled job is no longer available.");
    if (occurrence.state === "Skipped")
      throw new Error("Skipped jobs cannot be started.");
    // A stable execution ID makes retries safe even if the second storage write fails.
    const executionId = occurrence.executionId || `planned-${occurrence.id}`;
    const orders = readWorkOrders(orderKey);
    const inspections = readInspectionPreview(inspectionKey);
    const exists =
      occurrence.kind === "PM"
        ? orders.some((item) => item.id === executionId)
        : inspections.reports.some((item) => item.id === executionId);
    if (occurrence.executionId && !exists)
      throw new Error(
        "The linked execution record is missing. Restore that record before continuing; a duplicate will not be created.",
      );
    if (!exists) {
      const plan = data.plans.find((item) => item.id === occurrence.planId);
      if (!plan || plan.status !== "Active")
        throw new Error(
          "Resume this maintenance plan before starting a new job.",
        );
      const currentAsset = readAssets(assetKey).find(
        (item) => item.id === occurrence.assetId,
      );
      if (
        !currentAsset ||
        currentAsset.stage !== "Registered" ||
        currentAsset.usage === "Retired"
      )
        throw new Error(
          "This asset must be registered and not retired before starting maintenance.",
        );
      const asset = {
        ...currentAsset,
        name: occurrence.assetName,
        code: occurrence.assetCode,
        location: occurrence.assetLocation,
      };
      if (occurrence.kind === "PM") {
        const input = {
          ...emptyWorkOrder(),
          title: occurrence.planName,
          type: "Preventive" as const,
          assetId: occurrence.assetId,
          priority: occurrence.priority,
          description:
            `Scheduled from ${occurrence.planCode}. Planned date: ${occurrence.scheduledDate}.\n${occurrence.notes}`.slice(
              0,
              4000,
            ),
          assigneeId: occurrence.assigneeId,
          assigneeName: occurrence.assigneeName,
          team: occurrence.team,
          plannedStart: occurrence.scheduledAt,
          dueAt: occurrence.dueAt,
          estimatedDuration: String(occurrence.plannedMinutes / 60),
          tasks: structuredClone(occurrence.tasks),
          checklistId: occurrence.checklist?.id ?? "",
        };
        const order = workOrderSchema.parse({
          ...createWorkOrder(
            input,
            asset,
            occurrence.checklist,
            user!.name,
            orders,
          ),
          id: executionId,
        });
        const next = [order, ...orders];
        write(orderKey, next);
        client.setQueryData(["tpm-work-orders-preview", orderKey], next);
      } else {
        if (!occurrence.checklist)
          throw new Error("This AM job has no inspection checklist.");
        if (occurrence.scheduledDate > planningToday(occurrence.timeZone))
          throw new Error(
            "Start this inspection on its scheduled date or later.",
          );
        const report = {
          ...createInspectionSnapshot(
            occurrence.checklist,
            asset,
            {
              userId: user!.userId,
              name: user!.name,
              role: user!.roleLevel,
              inspectionDate: planningToday(occurrence.timeZone),
            },
            inspections.reports,
          ),
          id: executionId,
        };
        const next = inspectionPreviewSchema.parse({
          ...inspections,
          reports: [report, ...inspections.reports],
        });
        write(inspectionKey, next);
        client.setQueryData(["tpm-inspections-preview", inspectionKey], next);
      }
    }
    if (occurrence.executionId !== executionId) {
      try {
        persist({
          ...data,
          occurrences: data.occurrences.map((item) =>
            item.id === id
              ? { ...item, executionId, updatedAt: nowAfter(item.updatedAt) }
              : item,
          ),
        });
      } catch {
        throw new Error(
          "The execution record was saved, but its schedule link could not be saved. Free browser storage and retry this job to restore the link.",
        );
      }
    }
    return {
      href:
        occurrence.kind === "PM"
          ? `/tpm/work-orders/${executionId}`
          : `/tpm/inspection-reports/${executionId}`,
    };
  }
  function skipJob(id: string, reason: string) {
    const data = latest();
    const current = data.occurrences.find((item) => item.id === id);
    if (!current) throw new Error("This scheduled job is no longer available.");
    const stableId = current.executionId || `planned-${current.id}`;
    const alreadyStarted =
      current.kind === "PM"
        ? readWorkOrders(orderKey).some((item) => item.id === stableId)
        : readInspectionPreview(inspectionKey).reports.some(
            (item) => item.id === stableId,
          );
    if (current.executionId || alreadyStarted)
      throw new Error("Jobs with an execution record cannot be skipped.");
    if (current.state === "Skipped")
      throw new Error("This job is already skipped.");
    if (!reason.trim() || reason.trim().length > 500)
      throw new Error("Enter a skip reason of up to 500 characters.");
    persist({
      ...data,
      occurrences: data.occurrences.map((item) =>
        item.id === id
          ? {
              ...item,
              state: "Skipped" as const,
              skipReason: reason.trim(),
              updatedAt: nowAfter(item.updatedAt),
            }
          : item,
      ),
    });
  }

  return (
    <PlanningContext.Provider
      value={{
        plans: query.data?.plans ?? [],
        occurrences: query.data?.occurrences ?? [],
        loading: query.isPending,
        error: query.error?.message ?? null,
        retry: () => {
          void query.refetch();
        },
        savePlan,
        setPlanStatus,
        generateJobs,
        startJob,
        skipJob,
      }}
    >
      {children}
    </PlanningContext.Provider>
  );
}

export function useMaintenancePlans() {
  const context = useContext(PlanningContext);
  if (!context) throw new Error("MaintenancePlansProvider is required.");
  return context;
}
