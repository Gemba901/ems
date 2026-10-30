import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ASSET_LEVELS,
  assetSchema,
  createAssetsCsv,
  emptyAsset,
  readAssets,
  sampleAssets,
  type Asset,
} from "../components/tpm/asset-preview";
import { readAssetImportFile } from "../components/tpm/asset-import-file";

test("legacy stored assets gain Equipment level without changing existing details", () => {
  const original = sampleAssets()[0];
  const legacy: Partial<Asset> = { ...original };
  delete legacy.level;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => JSON.stringify([legacy]) },
  });
  try {
    const loaded = readAssets("legacy-assets");
    assert.equal(loaded[0].level, "Equipment");
    assert.equal(loaded[0].code, original.code);
    assert.equal(loaded[0].name, original.name);
    assert.deepEqual(loaded[0].history, original.history);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("asset schema accepts the six levels and rejects unsupported values", () => {
  const asset = sampleAssets()[0];
  assert.deepEqual(ASSET_LEVELS, [
    "Plant",
    "Area",
    "Line",
    "Station",
    "Equipment",
    "Component",
  ]);
  assert.equal(emptyAsset.level, "Equipment");
  for (const level of ASSET_LEVELS)
    assert.equal(assetSchema.parse({ ...asset, level }).level, level);
  assert.equal(
    assetSchema.safeParse({ ...asset, level: "Factory" }).success,
    false,
  );
});

test("CSV export preserves asset levels and resolves parent codes even outside filtered rows", async () => {
  const [sourcePlant, sourceMachine] = sampleAssets();
  const plant: Asset = {
    ...sourcePlant,
    code: "PLANT-01",
    name: "Main plant",
    level: "Plant",
  };
  const machine: Asset = {
    ...sourceMachine,
    code: "MACHINE-01",
    level: "Equipment",
    parentId: plant.id,
  };
  const csv = createAssetsCsv([machine], [plant, machine]);
  const file = await readAssetImportFile(new File([csv], "hierarchy.csv"));
  assert.equal(file.rows.length, 1);
  assert.equal(
    file.rows[0].values[file.headers.indexOf("Asset level")],
    "Equipment",
  );
  assert.equal(
    file.rows[0].values[file.headers.indexOf("Parent asset code")],
    "PLANT-01",
  );
  assert.equal(csv.includes(plant.id), false);
  const root = await readAssetImportFile(
    new File([createAssetsCsv([plant])], "plant.csv"),
  );
  assert.equal(
    root.rows[0].values[root.headers.indexOf("Parent asset code")],
    "",
  );
});
