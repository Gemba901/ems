import { emptyAsset, type Asset, type AssetLevel } from "./asset-preview";

type DemoNode = {
  key: string;
  name: string;
  level: AssetLevel;
  code: string;
  parent?: string;
  location: string;
  purpose: string;
};

const NAIROBI_DEMO: readonly DemoNode[] = [
  {
    key: "plant",
    name: "Nairobi Manufacturing Plant",
    level: "Plant",
    code: "DEMO-NBO-PLANT",
    location: "Nairobi, Kenya",
    purpose: "Manufacturing operations",
  },
  {
    key: "area",
    name: "Packaging Department",
    level: "Area",
    code: "DEMO-NBO-AREA",
    parent: "plant",
    location: "Nairobi Manufacturing Plant",
    purpose: "Packaging operations",
  },
  {
    key: "line",
    name: "Filling Line 01",
    level: "Line",
    code: "DEMO-NBO-LINE-01",
    parent: "area",
    location: "Packaging Department",
    purpose: "Product filling and packaging",
  },
  {
    key: "station",
    name: "Filling Station 01",
    level: "Station",
    code: "DEMO-NBO-STATION-01",
    parent: "line",
    location: "Filling Line 01",
    purpose: "Bottle filling station",
  },
  {
    key: "equipment",
    name: "Filling Machine",
    level: "Equipment",
    code: "DEMO-NBO-FILLER",
    parent: "station",
    location: "Filling Station 01",
    purpose: "Fill bottles to the specified volume",
  },
  {
    key: "motor",
    name: "Drive Motor",
    level: "Component",
    code: "DEMO-NBO-MOTOR",
    parent: "equipment",
    location: "Filling Machine",
    purpose: "Drive the filling machine mechanism",
  },
  {
    key: "pump",
    name: "Filling Pump",
    level: "Component",
    code: "DEMO-NBO-PUMP",
    parent: "equipment",
    location: "Filling Machine",
    purpose: "Supply product to the filling nozzles",
  },
  {
    key: "gearbox",
    name: "Gearbox",
    level: "Component",
    code: "DEMO-NBO-GEARBOX",
    parent: "equipment",
    location: "Filling Machine",
    purpose: "Transmit torque to the filling mechanism",
  },
];

const DEMO_DATE = "2026-10-14T08:00:00.000Z";
const DEMO_HISTORY_MESSAGE =
  "Nairobi demonstration hierarchy added to this preview.";
const assetId = (key: string) => `tpm-demo-nairobi-${key}`;
const historyId = (key: string) => `tpm-demo-nairobi-origin-${key}`;
const normalizeCode = (code: string) => code.trim().toLowerCase();

function findDemoNode(assets: readonly Asset[], key: string) {
  return assets.find((asset) =>
    asset.history.some(
      (event) =>
        event.id === historyId(key) && event.message === DEMO_HISTORY_MESSAGE,
    ),
  );
}

/** Fresh objects with stable IDs and explicit demo codes; does not write storage. */
export function getHierarchyDemoAssets(): Asset[] {
  return NAIROBI_DEMO.map((node) => ({
    ...emptyAsset,
    id: assetId(node.key),
    code: node.code,
    name: node.name,
    level: node.level,
    parentId: node.parent ? assetId(node.parent) : "",
    category: "Production equipment",
    site: "Nairobi Manufacturing Plant",
    department: "Packaging Department",
    location: node.location,
    purpose: node.purpose,
    team: "Packaging maintenance",
    stage: "Registered",
    description: `Demonstration ${node.level.toLowerCase()} in the Nairobi manufacturing hierarchy.`,
    notes: "Sample data for exploring asset hierarchy and parent selection.",
    createdAt: DEMO_DATE,
    updatedAt: DEMO_DATE,
    history: [
      { id: historyId(node.key), at: DEMO_DATE, message: DEMO_HISTORY_MESSAGE },
    ],
  }));
}

export function hasHierarchyDemoAssets(assets: readonly Asset[]): boolean {
  return NAIROBI_DEMO.every((node) => !!findDemoNode(assets, node.key));
}

/** Append missing demo nodes; preserve every existing record, including edited demos. */
export function mergeHierarchyDemoAssets(current: readonly Asset[]): Asset[] {
  const demo = getHierarchyDemoAssets();
  const occupiedIds = new Set(current.map((asset) => asset.id));
  const occupiedCodes = new Set(
    current.map((asset) => normalizeCode(asset.code)),
  );
  const resolvedIds = new Map<string, string>();
  const additions: Asset[] = [];

  demo.forEach((asset, index) => {
    const existing = findDemoNode(current, NAIROBI_DEMO[index].key);
    if (existing) {
      resolvedIds.set(asset.id, existing.id);
      return;
    }
    let id = asset.id;
    let idSuffix = 2;
    while (occupiedIds.has(id)) id = `${asset.id}-${idSuffix++}`;
    occupiedIds.add(id);
    let code = asset.code;
    let codeSuffix = 2;
    while (occupiedCodes.has(normalizeCode(code)))
      code = `${asset.code}-${codeSuffix++}`;
    occupiedCodes.add(normalizeCode(code));
    resolvedIds.set(asset.id, id);
    additions.push({ ...asset, id, code });
  });

  return [
    ...current,
    ...additions.map((asset) => ({
      ...asset,
      parentId: asset.parentId ? resolvedIds.get(asset.parentId)! : "",
    })),
  ];
}
