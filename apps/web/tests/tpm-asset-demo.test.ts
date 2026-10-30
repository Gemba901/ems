import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getHierarchyDemoAssets,
  hasHierarchyDemoAssets,
  mergeHierarchyDemoAssets,
} from "../components/tpm/asset-hierarchy-demo";
import {
  assetSchema,
  sampleAssets,
  validateAsset,
  type Asset,
} from "../components/tpm/asset-preview";

test("Nairobi demo contains the requested eight valid nodes and six hierarchy levels", () => {
  const assets = getHierarchyDemoAssets();
  assert.deepEqual(
    assets.map((asset) => asset.name),
    [
      "Nairobi Manufacturing Plant",
      "Packaging Department",
      "Filling Line 01",
      "Filling Station 01",
      "Filling Machine",
      "Drive Motor",
      "Filling Pump",
      "Gearbox",
    ],
  );
  assert.deepEqual(
    assets.map((asset) => asset.level),
    [
      "Plant",
      "Area",
      "Line",
      "Station",
      "Equipment",
      "Component",
      "Component",
      "Component",
    ],
  );
  assert.equal(assets[0].parentId, "");
  for (let index = 1; index < 5; index++)
    assert.equal(assets[index].parentId, assets[index - 1].id);
  for (const component of assets.slice(5))
    assert.equal(component.parentId, assets[4].id);
  for (const asset of assets) {
    assert.equal(assetSchema.safeParse(asset).success, true);
    assert.equal(asset.stage, "Registered");
    assert.deepEqual(validateAsset(asset, assets, asset.id), {});
  }
  assert.equal(hasHierarchyDemoAssets(assets), true);
  assert.equal(hasHierarchyDemoAssets(assets.slice(1)), false);
  assert.deepEqual(getHierarchyDemoAssets(), assets);
  assets[0].history[0].message = "Changed caller-owned data";
  assert.notEqual(
    getHierarchyDemoAssets()[0].history[0].message,
    assets[0].history[0].message,
  );
});

test("merging demo data preserves existing assets and is idempotent", () => {
  const original = sampleAssets();
  const snapshot = JSON.stringify(original);
  const merged = mergeHierarchyDemoAssets(original);
  assert.equal(merged.length, original.length + 8);
  assert.equal(JSON.stringify(original), snapshot);
  original.forEach((asset, index) => assert.equal(merged[index], asset));
  assert.equal(hasHierarchyDemoAssets(original), false);
  assert.equal(hasHierarchyDemoAssets(merged), true);
  const repeated = mergeHierarchyDemoAssets(merged);
  assert.deepEqual(repeated, merged);
  repeated.forEach((asset, index) => assert.equal(asset, merged[index]));
});

test("ID and case-insensitive code collisions create distinct demo nodes with correct parent links", () => {
  const demo = getHierarchyDemoAssets();
  const base = sampleAssets()[0];
  const existing: Asset[] = [
    { ...base, id: demo[0].id, code: ` ${demo[0].code.toLowerCase()} ` },
    { ...base, id: `${demo[0].id}-2`, code: `${demo[0].code}-2` },
    { ...base, id: demo[4].id, code: demo[4].code },
  ];
  const merged = mergeHierarchyDemoAssets(existing);
  const added = merged.slice(existing.length);
  assert.equal(new Set(merged.map((asset) => asset.id)).size, merged.length);
  assert.equal(
    new Set(merged.map((asset) => asset.code.trim().toLowerCase())).size,
    merged.length,
  );
  assert.equal(added[0].id, `${demo[0].id}-3`);
  assert.equal(added[0].code, `${demo[0].code}-3`);
  assert.equal(added[1].parentId, added[0].id);
  assert.equal(added[4].id, `${demo[4].id}-2`);
  for (const component of added.slice(5))
    assert.equal(component.parentId, added[4].id);
  assert.equal(hasHierarchyDemoAssets(merged), true);
  assert.deepEqual(mergeHierarchyDemoAssets(merged), merged);
});

test("partial demo restores missing nodes while preserving user edits and custom IDs", () => {
  const demo = getHierarchyDemoAssets();
  const editedPlant = {
    ...demo[0],
    id: "custom-plant-id",
    code: "MY-PLANT",
    name: "Renamed plant",
    notes: "Keep these notes",
  };
  const existing = [editedPlant];
  assert.equal(hasHierarchyDemoAssets(existing), false);
  const merged = mergeHierarchyDemoAssets(existing);
  assert.equal(merged.length, 8);
  assert.equal(merged[0], editedPlant);
  const area = merged.find((asset) => asset.name === "Packaging Department")!;
  assert.equal(area.parentId, editedPlant.id);
  assert.equal(hasHierarchyDemoAssets(merged), true);
  assert.deepEqual(mergeHierarchyDemoAssets(merged), merged);
});
