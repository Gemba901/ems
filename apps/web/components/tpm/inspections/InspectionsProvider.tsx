"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { readAssets } from "../asset-preview";
import {
  createInspectionSnapshot,
  inspectionPreviewSchema,
  inspectionToday,
  isValidInspectionDate,
  nextInspectionCode,
  readInspectionPreview,
  updateInspection,
  validateChecklist,
  type ChecklistInput,
  type InspectionAnswer,
  type InspectionChecklist,
  type InspectionPreview,
  type InspectionReport,
} from "./inspection-preview";
import "./inspection.css";

type InspectionsContextValue = {
  checklists: InspectionChecklist[];
  reports: InspectionReport[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  saveChecklist: (input: ChecklistInput, id?: string) => InspectionChecklist;
  duplicateChecklist: (id: string) => InspectionChecklist;
  setChecklistStatus: (
    id: string,
    status: InspectionChecklist["status"],
  ) => InspectionChecklist;
  startInspection: (
    checklistId: string,
    assetId: string,
    inspectionDate: string,
  ) => InspectionReport;
  saveInspection: (
    id: string,
    answers: Record<string, InspectionAnswer>,
    notes: string,
    complete?: boolean,
  ) => InspectionReport;
};
const InspectionsContext = createContext<InspectionsContextValue | null>(null);

export function InspectionsProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const scope = `${user?.organizationId ?? "none"}:${user?.userId ?? "none"}`;
  const storageKey = `gemba:tpm-inspections-preview:v1:${scope}`;
  const queryKey = ["tpm-inspections-preview", storageKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => readInspectionPreview(storageKey),
    enabled: !!user,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === storageKey)
        void client.invalidateQueries({
          queryKey: ["tpm-inspections-preview", storageKey],
        });
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client, storageKey]);

  function persist(data: InspectionPreview) {
    if (!user) throw new Error("Sign in before saving an inspection.");
    const checked = inspectionPreviewSchema.safeParse(data);
    if (!checked.success)
      throw new Error(
        "Check your inspection fields and text lengths before saving.",
      );
    try {
      localStorage.setItem(storageKey, JSON.stringify(checked.data));
    } catch {
      throw new Error(
        "This browser could not save your inspection preview. Allow browser storage or free some space and try again.",
      );
    }
    client.setQueryData(queryKey, checked.data);
  }

  function saveChecklist(input: ChecklistInput, id?: string) {
    const data = readInspectionPreview(storageKey);
    const existing = id
      ? data.checklists.find((item) => item.id === id)
      : undefined;
    if (id && !existing)
      throw new Error("This checklist is no longer available.");
    const cleaned: ChecklistInput = {
      ...input,
      name: input.name.trim(),
      description: input.description.trim(),
      items: input.items.map((item) => ({
        ...item,
        title: item.title.trim(),
        instructions: item.instructions.trim(),
        section: item.section.trim(),
        unit: item.unit.trim(),
        min: item.min.trim(),
        max: item.max.trim(),
      })),
    };
    const errors = validateChecklist(cleaned);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const now = new Date().toISOString();
    const saved: InspectionChecklist = {
      ...cleaned,
      id: id ?? crypto.randomUUID(),
      code: existing?.code ?? nextInspectionCode("CHK", data.checklists),
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    persist({
      ...data,
      checklists: existing
        ? data.checklists.map((item) => (item.id === id ? saved : item))
        : [saved, ...data.checklists],
    });
    return saved;
  }

  function duplicateChecklist(id: string) {
    const current = readInspectionPreview(storageKey).checklists.find(
      (item) => item.id === id,
    );
    if (!current) throw new Error("This checklist is no longer available.");
    return saveChecklist({
      ...current,
      name: `${current.name.slice(0, 190)} (copy)`,
      status: "Draft",
      items: current.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
    });
  }

  function setChecklistStatus(
    id: string,
    status: InspectionChecklist["status"],
  ) {
    const data = readInspectionPreview(storageKey);
    const current = data.checklists.find((item) => item.id === id);
    if (!current) throw new Error("This checklist is no longer available.");
    const errors = validateChecklist(current);
    if (status === "Published" && Object.keys(errors).length)
      throw new Error(Object.values(errors)[0]);
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    persist({
      ...data,
      checklists: data.checklists.map((item) =>
        item.id === id ? updated : item,
      ),
    });
    return updated;
  }

  function startInspection(
    checklistId: string,
    assetId: string,
    inspectionDate: string,
  ) {
    if (!user) throw new Error("Sign in before starting an inspection.");
    if (!isValidInspectionDate(inspectionDate))
      throw new Error("Choose a valid inspection date.");
    if (inspectionDate > inspectionToday(user.organizationTimeZone))
      throw new Error("Inspection date cannot be in the future.");
    const data = readInspectionPreview(storageKey);
    const checklist = data.checklists.find((item) => item.id === checklistId);
    if (!checklist) throw new Error("Choose an available checklist.");
    const asset = readAssets(`gemba:tpm-assets-preview:v1:${scope}`).find(
      (item) => item.id === assetId,
    );
    if (!asset) throw new Error("Choose an available asset.");
    const report = createInspectionSnapshot(
      checklist,
      asset,
      {
        userId: user.userId,
        name: user.name,
        role: user.roleLevel,
        inspectionDate,
      },
      data.reports,
    );
    persist({ ...data, reports: [report, ...data.reports] });
    return report;
  }

  function saveInspection(
    id: string,
    answers: Record<string, InspectionAnswer>,
    notes: string,
    complete = false,
  ) {
    const data = readInspectionPreview(storageKey);
    const current = data.reports.find((item) => item.id === id);
    if (!current)
      throw new Error("This inspection report is no longer available.");
    const updated = updateInspection(current, answers, notes, complete);
    persist({
      ...data,
      reports: data.reports.map((item) => (item.id === id ? updated : item)),
    });
    return updated;
  }

  return (
    <InspectionsContext.Provider
      value={{
        checklists: query.data?.checklists ?? [],
        reports: query.data?.reports ?? [],
        loading: query.isPending,
        error: query.error?.message ?? null,
        retry: () => {
          void query.refetch();
        },
        saveChecklist,
        duplicateChecklist,
        setChecklistStatus,
        startInspection,
        saveInspection,
      }}
    >
      {children}
    </InspectionsContext.Provider>
  );
}

export function useInspections() {
  const context = useContext(InspectionsContext);
  if (!context) throw new Error("InspectionsProvider is required.");
  return context;
}
