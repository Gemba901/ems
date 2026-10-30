import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAssetHierarchy,
  type AssetHierarchyNode,
} from "../components/tpm/asset-hierarchy";
import { sampleAssets, type Asset } from "../components/tpm/asset-preview";

const seed = sampleAssets()[0];
const asset = (id: string, parentId = "", code = id): Asset => ({
  ...seed,
  id,
  name: id,
  code,
  parentId,
});
const flatten = (roots: AssetHierarchyNode[]): AssetHierarchyNode[] =>
  roots.flatMap((node) => [node, ...flatten(node.children)]);
const build = (
  assets: Asset[],
  matches = assets.map((item) => item.id),
  sort?: string,
) => buildAssetHierarchy(assets, new Set(matches), sort);

test("hierarchy links out-of-order assets into multiple levels and sorts siblings", () => {
  const data = [
    asset("part", "equipment"),
    asset("equipment", "plant", "AST-10"),
    asset("plant"),
    asset("line", "plant", "AST-2"),
  ];
  const tree = build(data);
  assert.deepEqual(
    tree.roots.map((node) => node.asset.id),
    ["plant"],
  );
  assert.deepEqual(
    tree.roots[0].children.map((node) => node.asset.id),
    ["line", "equipment"],
  );
  assert.equal(tree.roots[0].children[1].children[0].asset.id, "part");
  assert.equal(tree.total, 4);
  assert.equal(tree.branches.size, 2);
});

test("matching a leaf retains only its ancestor path and distinguishes context", () => {
  const data = [
    asset("plant"),
    asset("line", "plant"),
    asset("pump", "line"),
    asset("unmatched", "plant"),
    asset("other-root"),
  ];
  const tree = build(data, ["pump"]);
  assert.deepEqual(
    flatten(tree.roots).map((node) => [node.asset.id, node.matches]),
    [
      ["plant", false],
      ["line", false],
      ["pump", true],
    ],
  );
  assert.equal(tree.contextCount, 2);
  assert.equal(tree.total, 3);
  assert.equal(build(data, []).total, 0);
});

test("missing parents, cycles, and self-parents stay visible once without mutation", () => {
  const data = [
    asset("orphan", "missing"),
    asset("a", "b"),
    asset("b", "c"),
    asset("c", "a"),
    asset("leaf", "b"),
    asset("self", "self"),
  ];
  const original = JSON.stringify(data);
  const tree = build(data);
  const all = flatten(tree.roots);
  assert.equal(all.length, data.length);
  assert.equal(new Set(all.map((node) => node.asset.id)).size, data.length);
  assert.equal(all.filter((node) => node.issue === "cycle").length, 2);
  assert.equal(
    all.find((node) => node.asset.id === "orphan")?.issue,
    "missing-parent",
  );
  assert.equal(JSON.stringify(data), original);
  const filteredCycle = build(data, ["leaf"]);
  assert.ok(
    flatten(filteredCycle.roots).some((node) => node.asset.id === "leaf"),
  );
});

test("sort choice changes siblings while preserving their parents", () => {
  const data = [
    asset("plant"),
    {
      ...asset("z-child", "plant", "AST-1"),
      updatedAt: "2026-10-14T00:00:00.000Z",
    },
    asset("a-child", "plant", "AST-2"),
  ];
  assert.deepEqual(
    build(data, undefined, "name").roots[0].children.map(
      (node) => node.asset.id,
    ),
    ["a-child", "z-child"],
  );
  assert.equal(
    build(data, undefined, "updated").roots[0].children[0].asset.id,
    "z-child",
  );
});
