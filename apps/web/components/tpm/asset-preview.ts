import { z } from "zod";

export const USAGE = ["Active", "Intermittent", "Inactive", "Retired"] as const;
export const HEALTH = [
  "Very Good",
  "Good",
  "Fair",
  "Poor",
  "Very Poor",
] as const;
export const OPERATING = [
  "Operational",
  "Under maintenance",
  "Breakdown",
  "Not in service",
] as const;
export const CATEGORIES = [
  "Production equipment",
  "Key utility equipment",
  "Auxiliary equipment",
] as const;
export const ASSET_LEVELS = [
  "Plant",
  "Area",
  "Line",
  "Station",
  "Equipment",
  "Component",
] as const;
export type AssetLevel = (typeof ASSET_LEVELS)[number];
export const ECONOMIC_IMPACT = [
  "High",
  "Moderate",
  "Low",
  "Zero contribution",
  "Operational value adding",
] as const;

const shortText = z.string().max(200);
const historySchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  message: z.string(),
});
export const assetSchema = z.object({
  id: z.string().min(1),
  code: shortText.min(1),
  name: shortText.min(1),
  level: z.enum(ASSET_LEVELS).default("Equipment"),
  category: z.enum(CATEGORIES).or(z.literal("")),
  purpose: shortText,
  site: shortText,
  department: shortText,
  location: shortText,
  parentId: z.string(),
  usage: z.enum(USAGE),
  health: z.enum(HEALTH),
  criticality: z.enum(["A", "B", "C"]),
  operating: z.enum(OPERATING),
  economicImpact: z.enum(ECONOMIC_IMPACT),
  operatorId: z.string().default(""),
  operator: shortText,
  backupOperator: shortText,
  maintenanceOwner: shortText,
  team: shortText,
  manufacturer: shortText,
  model: shortText,
  serialNumber: shortText,
  capacity: shortText,
  installedOn: z.string(),
  warrantyUntil: z.string(),
  description: z.string().max(4000),
  notes: z.string().max(4000),
  photo: z.string().max(1500000),
  stage: z.enum(["Draft", "Registered"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  history: z.array(historySchema),
});
export type Asset = z.infer<typeof assetSchema>;
export type AssetInput = Omit<
  Asset,
  "id" | "createdAt" | "updatedAt" | "history"
>;

export const emptyAsset: AssetInput = {
  code: "",
  name: "",
  level: "Equipment",
  category: "",
  purpose: "",
  site: "",
  department: "",
  location: "",
  parentId: "",
  usage: "Active",
  health: "Good",
  criticality: "B",
  operating: "Operational",
  economicImpact: "Moderate",
  operatorId: "",
  operator: "",
  backupOperator: "",
  maintenanceOwner: "",
  team: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  capacity: "",
  installedOn: "",
  warrantyUntil: "",
  description: "",
  notes: "",
  photo: "",
  stage: "Draft",
};

// A deliberately small, explicitly labelled design dataset. Equipment names and
// locations reference the workbook; people, ownership and operating state are examples.
export function sampleAssets(): Asset[] {
  const examples: Partial<AssetInput>[] = [
    {
      name: "Flour Automation",
      location: "Mixing",
      purpose: "Flour sieving",
      category: "Production equipment",
      health: "Very Good",
      criticality: "B",
      team: "Mechanical maintenance",
      description: "Flour handling and sieving equipment in the mixing area.",
      operator: "Sample operator",
      maintenanceOwner: "Sample technician",
    },
    {
      name: "Sugar Grinder 01",
      location: "Sugar Grinding",
      purpose: "Sugar grinding",
      category: "Key utility equipment",
      health: "Fair",
      criticality: "A",
      operating: "Under maintenance",
      team: "Mechanical maintenance",
      description: "Sugar grinding equipment serving the production line.",
    },
    {
      name: "Syrup Tank",
      location: "Mixing",
      purpose: "Heating syrup",
      category: "Key utility equipment",
      health: "Fair",
      criticality: "A",
      team: "Utilities team",
    },
    {
      name: "Cooling Tank",
      location: "Mixing",
      purpose: "Cooling syrup",
      category: "Production equipment",
      health: "Fair",
      criticality: "B",
      team: "Utilities team",
    },
    {
      name: "Compressor 01",
      location: "Compressor Room",
      purpose: "Compressed air supply",
      category: "Key utility equipment",
      criticality: "A",
      team: "Utilities team",
    },
    {
      name: "Carton Taping Machine 01",
      location: "Packing",
      purpose: "Carton taping",
      category: "Auxiliary equipment",
      criticality: "C",
      team: "Mechanical maintenance",
    },
    {
      name: "Fatsmelting Tank 01",
      location: "Mixing",
      purpose: "Heating fat",
      category: "Production equipment",
      usage: "Retired",
      operating: "Not in service",
      criticality: "B",
    },
    {
      name: "New Packing Equipment",
      location: "Packing",
      category: "Auxiliary equipment",
      stage: "Draft",
      operating: "Not in service",
      criticality: "C",
    },
  ];
  return examples.map((example, index) => ({
    ...emptyAsset,
    site: "Main plant",
    department: "Production",
    stage: "Registered",
    ...example,
    id: `sample-asset-${index + 1}`,
    code: `AST-${String(index + 1).padStart(4, "0")}`,
    createdAt: "2026-10-12T08:00:00.000Z",
    updatedAt: "2026-10-12T08:00:00.000Z",
    history: [
      {
        id: `sample-event-${index}`,
        at: "2026-10-12T08:00:00.000Z",
        message: "Sample asset added for the design preview.",
      },
    ],
  }));
}

export function readAssets(key: string): Asset[] {
  const raw = localStorage.getItem(key);
  if (!raw) return sampleAssets();
  const parsed = z.array(assetSchema).safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(
      "Your saved preview could not be read. Export or keep a copy before resetting it.",
    );
  return parsed.data;
}

export function nextAssetCode(assets: readonly Pick<Asset, "code">[]) {
  let highest = BigInt(0);
  for (const asset of assets) {
    const match = /^AST-(\d+)$/i.exec(asset.code.trim());
    if (!match) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `AST-${(highest + BigInt(1)).toString().padStart(4, "0")}`;
}

export function validateAsset(
  input: AssetInput,
  assets: Asset[],
  editingId?: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Enter an asset name.";
  if (!input.code.trim()) errors.code = "Enter an asset code.";
  if (
    assets.some(
      (asset) =>
        asset.id !== editingId &&
        asset.code.toLowerCase() === input.code.trim().toLowerCase(),
    )
  )
    errors.code = "This asset code is already in use.";
  if (input.stage === "Registered") {
    if (!input.category) errors.category = "Choose an equipment category.";
    if (!input.location.trim())
      errors.location = "Enter the workplace or Gemba.";
    if (!input.team.trim() && !input.maintenanceOwner.trim())
      errors.team = "Assign a maintenance team or responsible person.";
  }
  if (
    input.installedOn &&
    input.warrantyUntil &&
    input.warrantyUntil < input.installedOn
  )
    errors.warrantyUntil = "Warranty expiry must be on or after installation.";
  const visited = new Set(editingId ? [editingId] : []);
  let parent = input.parentId;
  while (parent) {
    if (visited.has(parent)) {
      errors.parentId =
        "An asset cannot be its own parent or be placed under its child.";
      break;
    }
    visited.add(parent);
    const match = assets.find((asset) => asset.id === parent);
    if (!match) {
      errors.parentId = "Choose an existing parent asset.";
      break;
    }
    parent = match.parentId;
  }
  return errors;
}

export function createAssetsCsv(
  assets: Asset[],
  allAssets: readonly Asset[] = assets,
) {
  const parents = new Map(allAssets.map((asset) => [asset.id, asset.code]));
  const columns: [string, keyof Asset][] = [
    ["Asset code", "code"],
    ["Name", "name"],
    ["Asset level", "level"],
    ["Parent asset code", "parentId"],
    ["Category", "category"],
    ["Site", "site"],
    ["Workplace", "location"],
    ["Criticality", "criticality"],
    ["Usage", "usage"],
    ["Health", "health"],
    ["Operating status", "operating"],
    ["Maintenance team", "team"],
    ["Stage", "stage"],
  ];
  const escape = (value: unknown) =>
    `"${String(value ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  return [
    columns.map(([label]) => escape(label)),
    ...assets.map((asset) =>
      columns.map(([, key]) =>
        escape(
          key === "parentId" ? (parents.get(asset.parentId) ?? "") : asset[key],
        ),
      ),
    ),
  ]
    .map((row) => row.join(","))
    .join("\r\n");
}

export function exportAssets(
  assets: Asset[],
  allAssets: readonly Asset[] = assets,
) {
  const content = createAssetsCsv(assets, allAssets);
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "tpm-assets-preview.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
