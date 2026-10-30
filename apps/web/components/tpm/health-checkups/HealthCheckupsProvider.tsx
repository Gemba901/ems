"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { readAssets } from "../asset-preview";
import {
  createCheckupSnapshot,
  healthCheckupPreviewSchema,
  healthToday,
  isValidHealthDate,
  linkWorkOrderToCheckup,
  markCheckupVerified,
  nextHealthCode,
  readHealthCheckupPreview,
  updateCheckup,
  validateAssignmentInput,
  validateStandard,
  type AssignmentInput,
  type HealthAnswer,
  type HealthAssignment,
  type HealthCheckup,
  type HealthCheckupPreview,
  type HealthStandard,
  type StandardInput,
} from "./health-checkup-preview";
import "./health-checkup.css";

type HealthCheckupsContextValue = {
  standards: HealthStandard[];
  assignments: HealthAssignment[];
  checkups: HealthCheckup[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  saveStandard: (input: StandardInput, id?: string) => HealthStandard;
  duplicateStandard: (id: string) => HealthStandard;
  setStandardStatus: (
    id: string,
    status: HealthStandard["status"],
  ) => HealthStandard;
  saveAssignments: (input: AssignmentInput) => HealthAssignment[];
  setAssignmentStatus: (
    id: string,
    status: HealthAssignment["status"],
  ) => HealthAssignment;
  startCheckup: (input: {
    standardId: string;
    assetId: string;
    checkupDate: string;
    assignmentId?: string;
    verifiesCheckupId?: string;
  }) => HealthCheckup;
  saveCheckup: (
    id: string,
    answers: Record<string, HealthAnswer>,
    notes: string,
    complete?: boolean,
  ) => HealthCheckup;
  linkWorkOrder: (checkupId: string, workOrderId: string) => HealthCheckup;
  applyVerification: (
    originalId: string,
    verificationId: string,
  ) => HealthCheckup;
};

const HealthCheckupsContext =
  createContext<HealthCheckupsContextValue | null>(null);

export function HealthCheckupsProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const scope = `${user?.organizationId ?? "none"}:${user?.userId ?? "none"}`;
  const storageKey = `gemba:tpm-health-checkups-preview:v1:${scope}`;
  const assetsKey = `gemba:tpm-assets-preview:v1:${scope}`;
  const queryKey = ["tpm-health-checkups-preview", storageKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => readHealthCheckupPreview(storageKey),
    enabled: !!user,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === storageKey)
        void client.invalidateQueries({
          queryKey: ["tpm-health-checkups-preview", storageKey],
        });
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client, storageKey]);

  function persist(data: HealthCheckupPreview) {
    if (!user) throw new Error("Sign in before saving a health checkup.");
    const checked = healthCheckupPreviewSchema.safeParse(data);
    if (!checked.success)
      throw new Error(
        "Check your health checkup fields and text lengths before saving.",
      );
    try {
      localStorage.setItem(storageKey, JSON.stringify(checked.data));
    } catch {
      throw new Error(
        "This browser could not save your health checkup preview. Allow browser storage or free some space and try again.",
      );
    }
    client.setQueryData(queryKey, checked.data);
  }

  function saveStandard(input: StandardInput, id?: string) {
    const data = readHealthCheckupPreview(storageKey);
    const existing = id
      ? data.standards.find((item) => item.id === id)
      : undefined;
    if (id && !existing)
      throw new Error("This standard is no longer available.");
    const cleaned: StandardInput = {
      ...input,
      name: input.name.trim(),
      machineType: input.machineType.trim(),
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
    const errors = validateStandard(cleaned);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const now = new Date().toISOString();
    const saved: HealthStandard = {
      ...cleaned,
      id: id ?? crypto.randomUUID(),
      code: existing?.code ?? nextHealthCode("STD", data.standards),
      version: existing ? existing.version + 1 : 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    persist({
      ...data,
      standards: existing
        ? data.standards.map((item) => (item.id === id ? saved : item))
        : [saved, ...data.standards],
    });
    return saved;
  }

  function duplicateStandard(id: string) {
    const current = readHealthCheckupPreview(storageKey).standards.find(
      (item) => item.id === id,
    );
    if (!current) throw new Error("This standard is no longer available.");
    return saveStandard({
      ...current,
      name: `${current.name.slice(0, 190)} (copy)`,
      status: "Draft",
      items: current.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
    });
  }

  function setStandardStatus(
    id: string,
    status: HealthStandard["status"],
  ) {
    const data = readHealthCheckupPreview(storageKey);
    const current = data.standards.find((item) => item.id === id);
    if (!current) throw new Error("This standard is no longer available.");
    const errors = validateStandard(current);
    if (status === "Published" && Object.keys(errors).length)
      throw new Error(Object.values(errors)[0]);
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    persist({
      ...data,
      standards: data.standards.map((item) =>
        item.id === id ? updated : item,
      ),
    });
    return updated;
  }

  function saveAssignments(input: AssignmentInput) {
    const errors = validateAssignmentInput(input);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const data = readHealthCheckupPreview(storageKey);
    const standard = data.standards.find(
      (item) => item.id === input.standardId,
    );
    if (!standard || standard.status !== "Published")
      throw new Error("Choose a published standard.");
    const assets = readAssets(assetsKey);
    const now = new Date().toISOString();
    const created: HealthAssignment[] = [];
    let working = data.assignments;
    for (const assetId of input.assetIds) {
      const asset = assets.find((item) => item.id === assetId);
      if (!asset || asset.stage !== "Registered" || asset.usage === "Retired")
        throw new Error(
          "Choose registered machines that have not been retired.",
        );
      const assignment: HealthAssignment = {
        id: crypto.randomUUID(),
        code: nextHealthCode("ASN", [...working, ...created]),
        standardId: standard.id,
        standardName: standard.name,
        standardCode: standard.code,
        machineType: standard.machineType,
        assetId: asset.id,
        assetName: asset.name,
        assetCode: asset.code,
        assetLocation: asset.location,
        assigneeName: input.assigneeName.trim(),
        assigneeId: input.assigneeId.trim(),
        frequency: input.frequency,
        nextDueAt: input.nextDueAt,
        status: "Active",
        createdAt: now,
        updatedAt: now,
      };
      created.push(assignment);
    }
    persist({ ...data, assignments: [...created, ...data.assignments] });
    return created;
  }

  function setAssignmentStatus(
    id: string,
    status: HealthAssignment["status"],
  ) {
    const data = readHealthCheckupPreview(storageKey);
    const current = data.assignments.find((item) => item.id === id);
    if (!current) throw new Error("This assignment is no longer available.");
    const updated = { ...current, status, updatedAt: new Date().toISOString() };
    persist({
      ...data,
      assignments: data.assignments.map((item) =>
        item.id === id ? updated : item,
      ),
    });
    return updated;
  }

  function startCheckup(input: {
    standardId: string;
    assetId: string;
    checkupDate: string;
    assignmentId?: string;
    verifiesCheckupId?: string;
  }) {
    if (!user) throw new Error("Sign in before starting a checkup.");
    if (!isValidHealthDate(input.checkupDate))
      throw new Error("Choose a valid checkup date.");
    if (input.checkupDate > healthToday(user.organizationTimeZone))
      throw new Error("Checkup date cannot be in the future.");
    const data = readHealthCheckupPreview(storageKey);
    const standard = data.standards.find(
      (item) => item.id === input.standardId,
    );
    if (!standard) throw new Error("Choose an available standard.");
    const asset = readAssets(assetsKey).find(
      (item) => item.id === input.assetId,
    );
    if (!asset) throw new Error("Choose an available asset.");
    if (input.verifiesCheckupId) {
      const original = data.checkups.find(
        (item) => item.id === input.verifiesCheckupId,
      );
      if (!original)
        throw new Error("The original checkup is no longer available.");
      if (
        original.status !== "Pending verification" &&
        !(
          original.status === "Completed" &&
          (original.healthStatus === "Needs Attention" ||
            original.healthStatus === "Critical")
        )
      )
        throw new Error(
          "Start a verification only for checkups that still need corrective follow-up.",
        );
    }
    const checkup = createCheckupSnapshot(
      standard,
      asset,
      {
        userId: user.userId,
        name: user.name,
        role: user.roleLevel,
        checkupDate: input.checkupDate,
      },
      data.checkups,
      {
        assignmentId: input.assignmentId,
        verifiesCheckupId: input.verifiesCheckupId,
      },
    );
    persist({ ...data, checkups: [checkup, ...data.checkups] });
    return checkup;
  }

  function saveCheckup(
    id: string,
    answers: Record<string, HealthAnswer>,
    notes: string,
    complete = false,
  ) {
    const data = readHealthCheckupPreview(storageKey);
    const current = data.checkups.find((item) => item.id === id);
    if (!current)
      throw new Error("This health checkup is no longer available.");
    let updated = updateCheckup(current, answers, notes, complete);
    let checkups = data.checkups.map((item) =>
      item.id === id ? updated : item,
    );
    if (
      complete &&
      updated.verifiesCheckupId &&
      updated.healthStatus === "Healthy" &&
      updated.status === "Completed"
    ) {
      const original = checkups.find(
        (item) => item.id === updated.verifiesCheckupId,
      );
      if (original) {
        const verified = markCheckupVerified(original, updated);
        checkups = checkups.map((item) =>
          item.id === original.id ? verified : item,
        );
      }
    }
    persist({ ...data, checkups });
    return updated;
  }

  function linkWorkOrder(checkupId: string, workOrderId: string) {
    const data = readHealthCheckupPreview(storageKey);
    const current = data.checkups.find((item) => item.id === checkupId);
    if (!current)
      throw new Error("This health checkup is no longer available.");
    const updated = linkWorkOrderToCheckup(current, workOrderId);
    persist({
      ...data,
      checkups: data.checkups.map((item) =>
        item.id === checkupId ? updated : item,
      ),
    });
    return updated;
  }

  function applyVerification(originalId: string, verificationId: string) {
    const data = readHealthCheckupPreview(storageKey);
    const original = data.checkups.find((item) => item.id === originalId);
    const verification = data.checkups.find(
      (item) => item.id === verificationId,
    );
    if (!original || !verification)
      throw new Error("Both checkups must still be available.");
    const verified = markCheckupVerified(original, verification);
    persist({
      ...data,
      checkups: data.checkups.map((item) =>
        item.id === originalId ? verified : item,
      ),
    });
    return verified;
  }

  return (
    <HealthCheckupsContext.Provider
      value={{
        standards: query.data?.standards ?? [],
        assignments: query.data?.assignments ?? [],
        checkups: query.data?.checkups ?? [],
        loading: query.isPending,
        error: query.error?.message ?? null,
        retry: () => {
          void query.refetch();
        },
        saveStandard,
        duplicateStandard,
        setStandardStatus,
        saveAssignments,
        setAssignmentStatus,
        startCheckup,
        saveCheckup,
        linkWorkOrder,
        applyVerification,
      }}
    >
      {children}
    </HealthCheckupsContext.Provider>
  );
}

export function useHealthCheckups() {
  const context = useContext(HealthCheckupsContext);
  if (!context) throw new Error("HealthCheckupsProvider is required.");
  return context;
}
