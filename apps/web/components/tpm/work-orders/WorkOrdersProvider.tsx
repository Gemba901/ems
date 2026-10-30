"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { readAssets } from "../asset-preview";
import { readInspectionPreview } from "../inspections/inspection-preview";
import {
  changeWorkOrderStatus,
  completeWorkOrder,
  createWorkOrder,
  createWorkOrderDraft,
  readWorkOrders,
  releaseWorkOrderDraft,
  saveWorkOrderWork,
  saveWorkOrderCompletion,
  setWorkOrderFinancialClosed,
  startWorkOrderTask,
  stopWorkOrderTask,
  updateWorkOrderDraft,
  updateWorkOrderDetails,
} from "./work-order-preview";
import type {
  WorkOrder,
  WorkOrderCompletion,
  WorkOrderInput,
  WorkOrderStatus,
  WorkOrderWork,
} from "./work-order-types";

type WorkOrdersContextValue = {
  orders: WorkOrder[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  create: (input: WorkOrderInput) => WorkOrder;
  saveDraft: (input: WorkOrderInput, id?: string) => WorkOrder;
  releaseDraft: (id: string, input: WorkOrderInput) => WorkOrder;
  updateDetails: (id: string, input: WorkOrderInput) => WorkOrder;
  saveWork: (id: string, work: WorkOrderWork) => WorkOrder;
  startTask: (id: string, taskId: string) => WorkOrder;
  stopTask: (id: string, taskId: string) => WorkOrder;
  setStatus: (id: string, status: WorkOrderStatus) => WorkOrder;
  complete: (id: string, completion: WorkOrderCompletion) => WorkOrder;
  saveCompletion: (id: string, completion: WorkOrderCompletion) => WorkOrder;
  setFinancialClosed: (id: string, closed: boolean) => WorkOrder;
};
const WorkOrdersContext = createContext<WorkOrdersContextValue | null>(null);

export function WorkOrdersProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const scope = `${user?.organizationId ?? "none"}:${user?.userId ?? "none"}`;
  const storageKey = `gemba:tpm-work-orders-preview:v1:${scope}`;
  const queryKey = ["tpm-work-orders-preview", storageKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => readWorkOrders(storageKey),
    enabled: !!user,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) {
        void client.invalidateQueries({
          queryKey: ["tpm-work-orders-preview", storageKey],
        });
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client, storageKey]);

  function latest() {
    if (!user) throw new Error("Sign in before saving a work order.");
    return readWorkOrders(storageKey);
  }
  function persist(orders: WorkOrder[]) {
    if (!user) throw new Error("Sign in before saving a work order.");
    try {
      localStorage.setItem(storageKey, JSON.stringify(orders));
    } catch {
      throw new Error(
        "This browser could not save your work order preview. Remove large photos or documents, or allow browser storage, then try again.",
      );
    }
    // Do not display success or update the UI cache until storage succeeds.
    client.setQueryData(queryKey, orders);
  }
  function modify(
    id: string,
    update: (current: WorkOrder, now: string) => WorkOrder,
  ) {
    const orders = latest();
    const current = orders.find((order) => order.id === id);
    if (!current)
      throw new Error(
        "This work order is no longer available. Return to the work order list.",
      );
    const cached = client
      .getQueryData<WorkOrder[]>(queryKey)
      ?.find((order) => order.id === id);
    if (cached && JSON.stringify(current) !== JSON.stringify(cached)) {
      void client.invalidateQueries({ queryKey });
      throw new Error(
        "This work order changed in another tab. Reload its latest details before saving again.",
      );
    }
    const now = new Date(
      Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
    ).toISOString();
    const saved = update(current, now);
    persist(orders.map((order) => (order.id === id ? saved : order)));
    return saved;
  }
  function asset(id: string) {
    return readAssets(`gemba:tpm-assets-preview:v1:${scope}`).find(
      (item) => item.id === id,
    );
  }
  function checklist(id: string) {
    return id
      ? readInspectionPreview(
          `gemba:tpm-inspections-preview:v1:${scope}`,
        ).checklists.find((item) => item.id === id)
      : null;
  }

  return (
    <WorkOrdersContext.Provider
      value={{
        orders: query.data ?? [],
        loading: query.isPending,
        error: query.error?.message ?? null,
        retry: () => {
          void query.refetch();
        },
        create: (input) => {
          const orders = latest();
          const saved = createWorkOrder(
            input,
            asset(input.assetId),
            checklist(input.checklistId),
            user?.name || "Current user",
            orders,
          );
          persist([saved, ...orders]);
          return saved;
        },
        saveDraft: (input, id) => {
          if (id)
            return modify(id, (current, now) =>
              updateWorkOrderDraft(
                current,
                input,
                input.assetId ? asset(input.assetId) : undefined,
                checklist(input.checklistId),
                now,
              ),
            );
          const orders = latest();
          const saved = createWorkOrderDraft(
            input,
            input.assetId ? asset(input.assetId) : undefined,
            checklist(input.checklistId),
            user?.name || "Current user",
            orders,
          );
          persist([saved, ...orders]);
          return saved;
        },
        releaseDraft: (id, input) =>
          modify(id, (current, now) =>
            releaseWorkOrderDraft(
              current,
              input,
              asset(input.assetId),
              checklist(input.checklistId),
              now,
            ),
          ),
        updateDetails: (id, input) =>
          modify(id, (current, now) =>
            updateWorkOrderDetails(
              current,
              input,
              input.assetId === current.assetId
                ? undefined
                : asset(input.assetId),
              input.checklistId === current.checklistId
                ? undefined
                : checklist(input.checklistId),
              now,
            ),
          ),
        saveWork: (id, work) =>
          modify(id, (current, now) => saveWorkOrderWork(current, work, now, {
            id: user?.userId ?? "",
            name: user?.name || "Current user",
          })),
        startTask: (id, taskId) =>
          modify(id, (current, now) => startWorkOrderTask(current, taskId, {
            id: user?.userId ?? "",
            name: user?.name || "Current user",
          }, now)),
        stopTask: (id, taskId) =>
          modify(id, (current, now) => stopWorkOrderTask(current, taskId, now)),
        setStatus: (id, status) =>
          modify(id, (current, now) =>
            changeWorkOrderStatus(current, status, now),
          ),
        complete: (id, completion) =>
          modify(id, (current, now) =>
            completeWorkOrder(current, completion, now),
          ),
        saveCompletion: (id, completion) =>
          modify(id, (current, now) =>
            saveWorkOrderCompletion(current, completion, now),
          ),
        setFinancialClosed: (id, closed) =>
          modify(id, (current, now) =>
            setWorkOrderFinancialClosed(current, closed, now),
          ),
      }}
    >
      {children}
    </WorkOrdersContext.Provider>
  );
}

export function useWorkOrders() {
  const context = useContext(WorkOrdersContext);
  if (!context) throw new Error("WorkOrdersProvider is required.");
  return context;
}
