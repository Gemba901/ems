"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { prepareAssetImport, type AssetImportRow } from "./asset-import";
import { mergeHierarchyDemoAssets } from "./asset-hierarchy-demo";
import {
  type Asset,
  type AssetInput,
  assetSchema,
  nextAssetCode,
  readAssets,
  sampleAssets,
  validateAsset,
} from "./asset-preview";

type AssetsContextValue = {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  save: (
    input: AssetInput,
    id?: string,
    options?: { autoGenerateCode?: boolean },
  ) => Asset;
  importAssets: (rows: AssetImportRow[]) => Asset[];
  addHierarchyDemo: () => Asset[];
  reset: () => void;
  retry: () => void;
};
const AssetsContext = createContext<AssetsContextValue | null>(null);

export function AssetsProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const client = useQueryClient();
  const storageKey = `gemba:tpm-assets-preview:v1:${user?.organizationId ?? "none"}:${user?.userId ?? "none"}`;
  const queryKey = ["tpm-assets-preview", storageKey];
  const query = useQuery({
    queryKey,
    queryFn: async () => readAssets(storageKey),
    enabled: !!user,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === storageKey)
        void client.invalidateQueries({
          queryKey: ["tpm-assets-preview", storageKey],
        });
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [client, storageKey]);

  function persist(assets: Asset[]) {
    if (!user) throw new Error("Sign in before saving an asset.");
    try {
      localStorage.setItem(storageKey, JSON.stringify(assets));
    } catch {
      throw new Error(
        "This browser could not save your preview. Remove a large photo or allow browser storage, then try again.",
      );
    }
    client.setQueryData(queryKey, assets);
  }

  function save(
    input: AssetInput,
    id?: string,
    options: { autoGenerateCode?: boolean } = {},
  ) {
    // Read at save time so changes from another tab are not silently overwritten.
    const current = readAssets(storageKey);
    const existing = id ? current.find((asset) => asset.id === id) : undefined;
    if (id && !existing)
      throw new Error(
        "This asset is no longer available. Return to the asset list.",
      );
    const cleaned = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        typeof value === "string" && key !== "photo" ? value.trim() : value,
      ]),
    ) as AssetInput;
    // Preview allocation lives here so the future API can generate codes at save
    // time. Manual codes are validated against the latest assets as well.
    cleaned.code = existing
      ? existing.code
      : options.autoGenerateCode === false
        ? cleaned.code
        : nextAssetCode(current);
    const errors = validateAsset(cleaned, current, id);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    const now = new Date().toISOString();
    const asset = assetSchema.parse({
      ...cleaned,
      id: id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      history: [
        {
          id: crypto.randomUUID(),
          at: now,
          message: existing
            ? "Asset details updated in this preview."
            : cleaned.stage === "Draft"
              ? "Asset saved as a draft."
              : "Asset registered in this preview.",
        },
        ...(existing?.history ?? []),
      ],
    });
    persist(
      existing
        ? current.map((item) => (item.id === id ? asset : item))
        : [asset, ...current],
    );
    return asset;
  }

  function importAssets(rows: AssetImportRow[]) {
    // Recheck the whole batch against storage, including changes from another tab.
    // Prepare everything first; a validation or storage error saves no partial batch.
    const current = readAssets(storageKey);
    const imported = prepareAssetImport(rows, current);
    persist([...imported, ...current]);
    return imported;
  }

  function addHierarchyDemo() {
    const current = readAssets(storageKey);
    const merged = mergeHierarchyDemoAssets(current);
    persist(merged);
    return merged;
  }

  return (
    <AssetsContext.Provider
      value={{
        assets: query.data ?? [],
        loading: query.isPending,
        error: query.error?.message ?? null,
        save,
        importAssets,
        addHierarchyDemo,
        reset: () => persist(sampleAssets()),
        retry: () => {
          void query.refetch();
        },
      }}
    >
      {children}
    </AssetsContext.Provider>
  );
}

export function useAssets() {
  const context = useContext(AssetsContext);
  if (!context) throw new Error("AssetsProvider is required.");
  return context;
}
